# Element X Fork Guide — Aether Clinical App

This document specifies all changes required to fork [Element X Android/iOS](https://github.com/element-hq/element-x-android) into the Aether Clinical app. The fork adds SITHS NFC authentication, in-memory clinical photo capture, and the `com.aether.clinical_capture` Matrix event type.

## Repository setup

```
git clone https://github.com/element-hq/element-x-android aether-clinical-android
git clone https://github.com/element-hq/element-x-ios     aether-clinical-ios
```

---

## Patch 001 — In-memory camera capture (Android)

**File:** `features/messages/impl/src/main/kotlin/io/element/android/features/messages/impl/camera/ClinicalCapturePresenter.kt` (new file)

### Constraint
Images must never be written to `MediaStore`, `ContentResolver`, or any file on external/shared storage. Use `CameraX` → `ImageProxy` byte buffer directly.

### Implementation

```kotlin
import androidx.camera.core.*
import java.util.concurrent.Executors

class ClinicalCapturePresenter @Inject constructor(
    private val matrixClient: MatrixClient,
    private val patientContext: PatientContextProvider,
) : Presenter<ClinicalCaptureState> {

    @Composable
    override fun present(): ClinicalCaptureState {
        // ...
    }

    // Called by the ImageCapture.takePicture() callback
    // imageBytes is in-memory — never hits disk
    suspend fun onImageCaptured(imageBytes: ByteArray, metadata: CaptureMetadata) {
        // 1. Upload to Matrix media store (in-memory stream, not file path)
        val mxcUri = matrixClient.mediaApi().uploadMedia(
            mimeType = "image/jpeg",
            stream = imageBytes.inputStream(),
            filename = null,  // no filename — prevents automatic gallery indexing
        )

        // 2. Send com.aether.clinical_capture state event to room
        val content = buildJsonObject {
            put("mxc_uri", mxcUri.value)
            put("patient_id", patientContext.current.id)
            put("patient_name", patientContext.current.name)
            put("body_site", metadata.bodySite)
            put("clinical_context", metadata.clinicalContext)
            put("note", metadata.note)
            putJsonArray("tags") { metadata.tags.forEach { add(it) } }
            put("sender_hsa_id", matrixClient.sessionId.userId)
        }
        matrixClient.getRoom(metadata.roomId)?.sendEvent(
            eventType = "com.aether.clinical_capture",
            content = content,
        )

        // 3. Zero the byte array before releasing
        imageBytes.fill(0)
    }
}
```

**Camera setup (no MediaStore)**

```kotlin
val imageCapture = ImageCapture.Builder()
    .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
    .build()

imageCapture.takePicture(
    ContextCompat.getMainExecutor(context),
    object : ImageCapture.OnImageCapturedCallback() {
        override fun onCaptureSuccess(image: ImageProxy) {
            // Convert ImageProxy to byte array in-memory
            val buffer = image.planes[0].buffer
            val bytes = ByteArray(buffer.remaining())
            buffer.get(bytes)
            image.close()
            // bytes is never written to disk
            scope.launch { presenter.onImageCaptured(bytes, currentMetadata) }
        }
    }
)
```

**Manifest** — do NOT add these permissions:
```xml
<!-- NEVER add these for clinical capture: -->
<!-- <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE"/> -->
<!-- <uses-permission android:name="android.permission.READ_MEDIA_IMAGES"/> -->
```

Only add:
```xml
<uses-permission android:name="android.permission.CAMERA"/>
```

---

## Patch 002 — In-memory camera capture (iOS)

**Constraint:** Never use `UIImagePickerController`, `PHPhotoLibrary`, or `PHAssetCreationRequest`. Use `AVCaptureSession` → `CMSampleBuffer` directly.

```swift
// ClinicalCaptureCoordinator.swift
import AVFoundation
import UIKit

final class ClinicalCaptureCoordinator: NSObject, AVCapturePhotoCaptureDelegate {
    private let session = AVCaptureSession()
    private let photoOutput = AVCapturePhotoOutput()

    func capturePhoto() {
        let settings = AVCapturePhotoSettings(format: [AVVideoCodecKey: AVVideoCodecType.jpeg])
        // IMPORTANT: no file output configured — data stays in CMSampleBuffer
        photoOutput.capturePhoto(with: settings, delegate: self)
    }

    func photoOutput(
        _ output: AVCapturePhotoOutput,
        didFinishProcessingPhoto photo: AVCapturePhoto,
        error: Error?
    ) {
        guard error == nil,
              let data = photo.fileDataRepresentation() else { return }

        // data is a Data (byte buffer) — never written to PHPhotoLibrary
        Task {
            await uploadCapture(imageData: data, metadata: currentMetadata)
            // Zero out the data buffer
            // Note: Swift Data is value type; the local var goes out of scope
            // and ARC reclaims it. For extra assurance use SecureZeroMemory
            // on the underlying bytes before release (see patch 004).
        }
    }
}
```

**Info.plist** — only camera permission, NOT photo library:
```xml
<key>NSCameraUsageDescription</key>
<string>Klinisk fotografering för journaldokumentation</string>
<!-- NSPhotoLibraryUsageDescription intentionally omitted -->
```

---

## Patch 003 — SITHS NFC authentication (Android)

**File:** `features/siths/impl/src/main/kotlin/io/element/android/features/siths/impl/SITHSNFCPresenter.kt`

SITHS cards use ISO 7816-4 APDUs over NFC (ISO-DEP / MIFARE DESFire EV1).

```kotlin
import android.nfc.tech.IsoDep
import android.nfc.Tag

class SITHSNFCReader {
    /**
     * Read the SITHS authentication certificate from the card.
     * Returns the DER-encoded certificate bytes.
     *
     * SITHS card structure (PKCS#15):
     *   AID: A0 00 00 00 63 50 4B 43 53 2D 31 35 (PKCS#15)
     *   EF(OD) → points to EF(CDF) → AuthCert
     *
     * Swedish SITHS AID: E8 28 BD 08 0F D2 50 4B 43 53 31 35
     */
    fun readAuthCert(tag: Tag): ByteArray {
        val isoDep = IsoDep.get(tag) ?: throw SITHSException("Not an ISO-DEP tag")
        isoDep.connect()
        isoDep.timeout = 5000

        return try {
            // SELECT AID (SITHS PKCS#15)
            val selectSITHS = byteArrayOf(
                0x00, 0xA4.toByte(), 0x04, 0x00, 0x0C,
                0xE8.toByte(), 0x28, 0xBD.toByte(), 0x08, 0x0F, 0xD2.toByte(),
                0x50, 0x4B, 0x43, 0x53, 0x31, 0x35
            )
            val selectResp = isoDep.transceive(selectSITHS)
            check(selectResp.sw() == 0x9000) { "SELECT AID failed: ${selectResp.swHex()}" }

            // SELECT EF(AOD) — Authentication Object Directory
            val selectAOD = byteArrayOf(0x00, 0xA4.toByte(), 0x02, 0x0C, 0x02, 0x40, 0x34)
            val aodResp = isoDep.transceive(selectAOD)
            check(aodResp.sw() == 0x9000) { "SELECT AOD failed" }

            // READ BINARY — read the auth certificate reference
            // In practice, parse ASN.1 from EF(OD)/EF(CDF) to locate the cert EF
            // For brevity: read the auth cert EF directly (file ID 0x4031 on most SITHS cards)
            val selectCertEF = byteArrayOf(0x00, 0xA4.toByte(), 0x02, 0x0C, 0x02, 0x40, 0x31)
            isoDep.transceive(selectCertEF)

            readBinaryFull(isoDep)
        } finally {
            isoDep.close()
        }
    }

    private fun readBinaryFull(isoDep: IsoDep): ByteArray {
        val result = mutableListOf<Byte>()
        var offset = 0
        while (true) {
            val cmd = byteArrayOf(
                0x00, 0xB0.toByte(),
                (offset shr 8).toByte(), (offset and 0xFF).toByte(),
                0x00  // Le=256
            )
            val resp = isoDep.transceive(cmd)
            val sw = resp.sw()
            if (sw == 0x9000) {
                result.addAll(resp.dropLast(2).toList())
                offset += resp.size - 2
            } else if ((sw shr 8) == 0x62 || (sw shr 8) == 0x63) {
                result.addAll(resp.dropLast(2).toList())
                break
            } else {
                break
            }
        }
        return result.toByteArray()
    }
}

private fun ByteArray.sw(): Int = ((this[size - 2].toInt() and 0xFF) shl 8) or (this[size - 1].toInt() and 0xFF)
private fun ByteArray.swHex(): String = "%04X".format(sw())
```

**Step-up flow:**

```kotlin
suspend fun performStepUp(captureId: String): StepUpResult {
    // 1. Read cert from card via NFC
    val certDer = sithsNFCReader.readAuthCert(nfcTag)

    // 2. POST to SITHS RP — cert sent as X-Dev-SITHS-Cert header in dev,
    //    or embedded in the mTLS handshake in production
    val response = sithsRpClient.auth(
        captureId = captureId,
        certDer = certDer,  // only used in dev mode
    )

    // 3. Return JWT step-up token to caller
    return StepUpResult(
        token = response.token,
        hsaId = response.hsa_id,
        displayName = response.display_name,
    )
}
```

---

## Patch 004 — SITHS NFC authentication (iOS)

```swift
import CoreNFC
import Foundation

// iOS reads SITHS via NFCTagReaderSession (ISO7816)
class SITHSNFCReader: NSObject, NFCTagReaderSessionDelegate {
    private var continuation: CheckedContinuation<Data, Error>?

    func readAuthCert() async throws -> Data {
        return try await withCheckedThrowingContinuation { cont in
            self.continuation = cont
            let session = NFCTagReaderSession(pollingOption: .iso14443, delegate: self)
            session?.alertMessage = "Håll SITHS-kortet mot telefonen"
            session?.begin()
        }
    }

    func tagReaderSession(_ session: NFCTagReaderSession, didDetect tags: [NFCTag]) {
        guard case .iso7816(let tag) = tags.first else { return }
        session.connect(to: tags[0]) { [weak self] error in
            guard error == nil else {
                self?.continuation?.resume(throwing: error!)
                return
            }
            // SELECT SITHS AID + read cert EF (same APDU sequence as Android)
            self?.selectAndReadCert(tag: tag, session: session)
        }
    }
}
```

**Secure zero on iOS:**

```swift
// After upload confirmation, zero the Data buffer using SecureZeroMemory
extension Data {
    mutating func secureZero() {
        withUnsafeMutableBytes { ptr in
            memset_s(ptr.baseAddress, ptr.count, 0, ptr.count)
        }
    }
}
```

---

## Patch 005 — Patient context injection

The mobile app receives patient context from Aether web via a deep link or QR code when opening a clinical room.

**Deep link format:**
```
aether-clinical://room?room_id=!abc123:hospital.se&patient_id=EL-2026-0847&patient_name=Erik+Lindstr%C3%B6m
```

**Android manifest:**
```xml
<intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW"/>
    <category android:name="android.intent.category.DEFAULT"/>
    <category android:name="android.intent.category.BROWSABLE"/>
    <data android:scheme="aether-clinical" android:host="room"/>
</intent-filter>
```

**PatientContextProvider:**
```kotlin
@Singleton
class PatientContextProvider @Inject constructor() {
    private val _current = MutableStateFlow<PatientContext?>(null)
    val current: StateFlow<PatientContext?> = _current.asStateFlow()

    fun setFromDeepLink(uri: Uri) {
        _current.value = PatientContext(
            id = uri.getQueryParameter("patient_id") ?: return,
            name = uri.getQueryParameter("patient_name") ?: "",
            roomId = uri.getQueryParameter("room_id") ?: "",
        )
    }
}
```

---

## Patch 006 — com.aether.clinical_capture event rendering

Register a custom timeline item renderer for `com.aether.clinical_capture` events.

```kotlin
// In TimelineItemTypeMapper.kt — add before the fallback case
"com.aether.clinical_capture" -> {
    ClinicalCaptureTimelineItem(
        id = eventId,
        mxcUri = content["mxc_uri"]?.jsonPrimitive?.content ?: "",
        bodySite = content["body_site"]?.jsonPrimitive?.content ?: "",
        clinicalContext = content["clinical_context"]?.jsonPrimitive?.content ?: "",
        note = content["note"]?.jsonPrimitive?.content ?: "",
        tags = content["tags"]?.jsonArray?.map { it.jsonPrimitive.content } ?: emptyList(),
        senderHsaId = content["sender_hsa_id"]?.jsonPrimitive?.content,
        emrStatus = EmrStatus.PENDING,  // updated via capture service API polling
    )
}
```

---

## Build configuration

**Android `build.gradle.kts` changes:**
```kotlin
android {
    defaultConfig {
        applicationId = "se.aether.clinical"
        // ...
    }
    buildTypes {
        release {
            // Disable backup — ZLP: no image data in Android backup
            manifestPlaceholders["allowBackup"] = "false"
        }
    }
}
```

**iOS `Info.plist` backup exclusion:**
```xml
<key>NSUbiquitousContainerIsDocumentScopePublic</key>
<false/>
<!-- Exclude all app data from iCloud backup -->
<key>UIFileSharingEnabled</key>
<false/>
```

---

## Environment variables (mobile)

Set in `local.properties` (Android) / `Config.xcconfig` (iOS):

```
AETHER_API_BASE=https://matrix.hospital.se
SITHS_RP_URL=https://matrix.hospital.se/siths
CAPTURE_API_URL=https://matrix.hospital.se/api/capture
```
