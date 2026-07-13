package com.pairbudget

import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Telephony
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.*
import java.text.SimpleDateFormat
import java.util.*

/**
 * SMS 읽기 네이티브 모듈
 * 문자함에서 지정 기간 내 SMS/MMS를 읽어 React Native로 전달합니다.
 */
class SmsReaderModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "SmsReader"

    @ReactMethod
    fun readSms(daysBack: Int, promise: Promise) {
        try {
            if (ContextCompat.checkSelfPermission(
                    reactApplicationContext,
                    android.Manifest.permission.READ_SMS
                ) != PackageManager.PERMISSION_GRANTED
            ) {
                promise.reject("PERMISSION_DENIED", "READ_SMS 권한이 없습니다")
                return
            }

            val smsList = WritableNativeArray()
            val cutoff = System.currentTimeMillis() - (daysBack.toLong() * 24 * 60 * 60 * 1000)
            val seenBodies = mutableSetOf<String>()

            // 1. 일반 SMS (inbox)
            readSmsFromUri(
                Uri.parse("content://sms/inbox"),
                cutoff, smsList, seenBodies, "sms_inbox"
            )

            // 2. MMS (모든 msg_box - inbox 제한 제거)
            try {
                readMmsMessages(cutoff, smsList, seenBodies)
            } catch (e: Exception) {
                android.util.Log.w("SmsReader", "MMS read failed: ${e.message}")
            }

            // 3. Samsung RCS 메시지 시도
            try {
                readSamsungRcs(cutoff, smsList, seenBodies)
            } catch (e: Exception) {
                android.util.Log.w("SmsReader", "Samsung RCS read failed: ${e.message}")
            }

            // 4. content://mms-sms (통합 뷰) 시도
            try {
                readMmsSmsUnified(cutoff, smsList, seenBodies)
            } catch (e: Exception) {
                android.util.Log.w("SmsReader", "mms-sms unified read failed: ${e.message}")
            }

            android.util.Log.i("SmsReader", "총 결과: ${smsList.size()}건")
            promise.resolve(smsList)
        } catch (e: Exception) {
            promise.reject("SMS_READ_ERROR", e.message, e)
        }
    }

    private fun readSmsFromUri(
        uri: Uri, cutoff: Long,
        smsList: WritableNativeArray,
        seenBodies: MutableSet<String>,
        source: String
    ) {
        val cursor = reactApplicationContext.contentResolver.query(
            uri,
            arrayOf("_id", "address", "body", "date"),
            "date > ?",
            arrayOf(cutoff.toString()),
            "date DESC"
        )
        var count = 0
        cursor?.use {
            val idIdx = it.getColumnIndex("_id")
            val addrIdx = it.getColumnIndex("address")
            val bodyIdx = it.getColumnIndex("body")
            val dateIdx = it.getColumnIndex("date")

            while (it.moveToNext()) {
                val body = it.getString(bodyIdx) ?: ""
                val bodyKey = body.trim().take(100)
                if (bodyKey.isNotEmpty() && seenBodies.contains(bodyKey)) continue
                if (bodyKey.isNotEmpty()) seenBodies.add(bodyKey)

                val sms = WritableNativeMap()
                sms.putString("id", it.getString(idIdx) ?: "")
                sms.putString("address", it.getString(addrIdx) ?: "")
                sms.putString("body", body)
                sms.putDouble("date", it.getLong(dateIdx).toDouble())
                smsList.pushMap(sms)
                count++
            }
        }
        android.util.Log.i("SmsReader", "[$source] ${count}건 읽음")
    }

    /**
     * MMS 메시지 읽기 - msg_box 제한 없이 모든 MMS 조회
     */
    private fun readMmsMessages(
        cutoff: Long,
        smsList: WritableNativeArray,
        seenBodies: MutableSet<String>
    ) {
        val cutoffSeconds = cutoff / 1000
        // msg_box 필터 제거 → 모든 MMS 조회
        val mmsCursor = reactApplicationContext.contentResolver.query(
            Uri.parse("content://mms"),
            arrayOf("_id", "date", "msg_box"),
            "date > ?",
            arrayOf(cutoffSeconds.toString()),
            "date DESC"
        )

        var count = 0
        var totalMms = 0
        mmsCursor?.use { cursor ->
            val idIdx = cursor.getColumnIndex("_id")
            val dateIdx = cursor.getColumnIndex("date")
            val msgBoxIdx = cursor.getColumnIndex("msg_box")

            while (cursor.moveToNext()) {
                totalMms++
                val mmsId = cursor.getString(idIdx) ?: continue
                val mmsDate = cursor.getLong(dateIdx) * 1000
                val msgBox = cursor.getInt(msgBoxIdx)

                val address = getMmsAddress(mmsId)
                val textBody = getMmsTextBody(mmsId)

                android.util.Log.d("SmsReader", "[MMS] id=$mmsId msgBox=$msgBox addr=$address bodyLen=${textBody?.length ?: 0} body=${textBody?.take(50) ?: "null"}")

                if (textBody.isNullOrBlank()) continue

                val bodyKey = textBody.trim().take(100)
                if (bodyKey.isNotEmpty() && seenBodies.contains(bodyKey)) continue
                seenBodies.add(bodyKey)

                val sms = WritableNativeMap()
                sms.putString("id", "mms_$mmsId")
                sms.putString("address", address ?: "")
                sms.putString("body", textBody)
                sms.putDouble("date", mmsDate.toDouble())
                smsList.pushMap(sms)
                count++
            }
        }
        android.util.Log.i("SmsReader", "[MMS] 총 ${totalMms}건 중 ${count}건 텍스트 추출")
    }

    /**
     * Samsung RCS 메시지 읽기 (content://im/chat)
     * date 컬럼 형식이 불확실하므로 필터 없이 최근 200건을 가져옴
     */
    private fun readSamsungRcs(
        cutoff: Long,
        smsList: WritableNativeArray,
        seenBodies: MutableSet<String>
    ) {
        val uri = Uri.parse("content://im/chat")
        try {
            // 금융기관 발신번호로 필터 (일반 대화가 섞여 LIMIT으로는 부족)
            val bankAddresses = listOf(
                "15882100", "1588-2100",  // NH농협
                "15881111", "1588-1111",  // 국민은행
                "15881688", "1588-1688",  // 신한은행
                "15885300", "1588-5300",  // 우리은행
                "15881601", "1588-1601",  // 하나은행
                "16001111", "1600-1111",  // IBK기업은행
                "15881515", "1588-1515",  // 카카오뱅크
                "15993900", "1599-3900",  // 토스뱅크
                "15887700", "1588-7700",  // 현대카드
                "15888700", "1588-8700",  // 삼성카드
                "15881000", "1588-1000",  // 신한카드
                "18001111", "1800-1111",  // 하나카드
                "15889955", "1588-9955",  // 롯데카드
                "16613000", "1661-3000"   // NH농협 (다른 번호)
            )
            val placeholders = bankAddresses.joinToString(",") { "?" }
            val cursor = reactApplicationContext.contentResolver.query(
                uri,
                arrayOf("_id", "address", "body", "date"),
                "address IN ($placeholders)",
                bankAddresses.toTypedArray(),
                "_id DESC"
            )

            var count = 0
            var skippedOld = 0
            cursor?.use {
                val idIdx = it.getColumnIndex("_id")
                val addrIdx = it.getColumnIndex("address")
                val bodyIdx = it.getColumnIndex("body")
                val dateIdx = it.getColumnIndex("date")

                while (it.moveToNext()) {
                    val body = it.getString(bodyIdx) ?: ""
                    if (body.isBlank()) continue

                    val rawDate = it.getLong(dateIdx)
                    // date가 초 단위인지 밀리초 단위인지 자동 감지
                    val dateMs = if (rawDate < 10000000000L) rawDate * 1000 else rawDate

                    // cutoff 이전 데이터는 스킵
                    if (dateMs < cutoff) {
                        skippedOld++
                        continue
                    }

                    // RCS는 _id로 중복 체크 (JSON body 앞부분이 동일하므로)
                    val msgId = it.getString(idIdx) ?: count.toString()
                    val bodyKey = "rcs_$msgId"
                    if (seenBodies.contains(bodyKey)) continue
                    seenBodies.add(bodyKey)

                    val sms = WritableNativeMap()
                    sms.putString("id", "rcs_${it.getString(idIdx) ?: count.toString()}")
                    sms.putString("address", it.getString(addrIdx) ?: "")
                    sms.putString("body", body)
                    sms.putDouble("date", dateMs.toDouble())
                    smsList.pushMap(sms)
                    count++

                    if (count <= 5) {
                        android.util.Log.d("SmsReader", "[RCS] id=${it.getString(idIdx)} rawDate=$rawDate dateMs=$dateMs addr=${it.getString(addrIdx)} body=${body.take(50)}")
                    }
                }
            }
            android.util.Log.i("SmsReader", "[RCS] content://im/chat에서 ${count}건 읽음 (${skippedOld}건 기간외)")
        } catch (e: Exception) {
            android.util.Log.w("SmsReader", "[RCS] content://im/chat 실패: ${e.message}")
        }
    }

    /**
     * content://mms-sms 통합 뷰에서 읽기 시도
     */
    private fun readMmsSmsUnified(
        cutoff: Long,
        smsList: WritableNativeArray,
        seenBodies: MutableSet<String>
    ) {
        try {
            val cursor = reactApplicationContext.contentResolver.query(
                Uri.parse("content://mms-sms/complete-conversations"),
                null,
                "date > ?",
                arrayOf(cutoff.toString()),
                "date DESC"
            )
            cursor?.use {
                val colNames = (0 until it.columnCount).map { i -> it.getColumnName(i) }
                android.util.Log.i("SmsReader", "[mms-sms] columns=${colNames.joinToString(",")}, rows=${it.count}")

                val bodyIdx = colNames.indexOf("body")
                val addrIdx = colNames.indexOf("address")
                val dateIdx = colNames.indexOf("date")
                val idIdx = colNames.indexOf("_id")

                if (bodyIdx < 0) {
                    android.util.Log.w("SmsReader", "[mms-sms] body 컬럼 없음, 스킵")
                    return
                }

                var count = 0
                while (it.moveToNext() && count < 50) {
                    val body = it.getString(bodyIdx) ?: ""
                    if (body.isBlank()) continue

                    val bodyKey = body.trim().take(100)
                    if (bodyKey.isNotEmpty() && seenBodies.contains(bodyKey)) continue
                    seenBodies.add(bodyKey)

                    val sms = WritableNativeMap()
                    sms.putString("id", "unified_${if (idIdx >= 0) it.getString(idIdx) else count.toString()}")
                    sms.putString("address", if (addrIdx >= 0) (it.getString(addrIdx) ?: "") else "")
                    sms.putString("body", body)
                    sms.putDouble("date", if (dateIdx >= 0) it.getLong(dateIdx).toDouble() else System.currentTimeMillis().toDouble())
                    smsList.pushMap(sms)
                    count++
                }
                android.util.Log.i("SmsReader", "[mms-sms] ${count}건 추가")
            }
        } catch (e: Exception) {
            android.util.Log.w("SmsReader", "[mms-sms] 실패: ${e.message}")
        }
    }

    private fun getMmsAddress(mmsId: String): String? {
        val addrCursor = reactApplicationContext.contentResolver.query(
            Uri.parse("content://mms/$mmsId/addr"),
            arrayOf("address", "type"),
            "type=137",
            null, null
        )
        return addrCursor?.use {
            if (it.moveToFirst()) {
                val addrIdx = it.getColumnIndex("address")
                it.getString(addrIdx)
            } else null
        }
    }

    private fun getMmsTextBody(mmsId: String): String? {
        val partCursor = reactApplicationContext.contentResolver.query(
            Uri.parse("content://mms/part"),
            arrayOf("_id", "ct", "text", "mid"),
            "mid = ?",
            arrayOf(mmsId),
            null
        )
        return partCursor?.use { cursor ->
            val textBuilder = StringBuilder()
            val ctIdx = cursor.getColumnIndex("ct")
            val textIdx = cursor.getColumnIndex("text")

            while (cursor.moveToNext()) {
                val contentType = cursor.getString(ctIdx) ?: ""
                if (contentType == "text/plain") {
                    val text = cursor.getString(textIdx) ?: ""
                    if (text.isNotBlank()) {
                        if (textBuilder.isNotEmpty()) textBuilder.append("\n")
                        textBuilder.append(text)
                    }
                }
            }
            val result = textBuilder.toString()
            if (result.isNotBlank()) result else null
        }
    }
}
