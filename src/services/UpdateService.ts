/**
 * PairBudget 앱 업데이트 체크 서비스
 * 
 * Firestore의 app_config/version 문서에서 최신 버전 정보를 확인하고,
 * 현재 앱 버전보다 높으면 업데이트 정보를 반환합니다.
 * 
 * 앱 내 직접 다운로드 → 패키지 설치 인텐트 실행 (브라우저 캐시 우회)
 * 
 * Firestore 문서 구조 (app_config/version):
 * {
 *   latestVersionCode: 2,
 *   latestVersionName: "1.1.0",
 *   downloadUrl: "https://drive.google.com/...",
 *   releaseNotes: "카테고리 상세 개선, 업데이트 체크 기능 추가",
 *   forceUpdate: false
 * }
 */

import firestore from '@react-native-firebase/firestore';
import { Platform } from 'react-native';

// ⚠️ 릴리즈 시 build.gradle의 versionCode/versionName과 반드시 함께 업데이트할 것
export const CURRENT_VERSION_CODE = 21;
export const CURRENT_VERSION_NAME = '1.20';

export interface UpdateInfo {
  latestVersionCode: number;
  latestVersionName: string;
  downloadUrl: string;
  releaseNotes: string;
  forceUpdate: boolean;
}

/**
 * 업데이트 체크 (앱 실행 시마다 체크)
 * @returns 업데이트가 있으면 UpdateInfo, 없으면 null
 */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  try {
    const doc = await firestore().collection('app_config').doc('version').get();
    if (!doc.exists) return null;

    const data = doc.data() as UpdateInfo;

    // 최신 버전이 현재보다 높으면 업데이트 정보 반환
    if (data.latestVersionCode > CURRENT_VERSION_CODE) {
      return data;
    }

    return null;
  } catch (error) {
    console.error('[UpdateService] Update check failed:', error);
    return null;
  }
}

/**
 * Google Drive URL을 직접 다운로드 가능한 URL로 변환
 */
function getDirectDownloadUrl(url: string): string {
  // Google Drive URL에서 file ID 추출
  let fileId: string | null = null;

  // /d/FILE_ID/ 패턴
  const shareMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (shareMatch) fileId = shareMatch[1];

  // id=FILE_ID 패턴
  if (!fileId) {
    const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (idMatch) fileId = idMatch[1];
  }

  if (fileId) {
    return `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
  }

  return url;
}

/**
 * APK를 앱 내에서 직접 다운로드하고 설치 인텐트를 실행
 * 브라우저 캐시를 완전히 우회합니다.
 * 
 * @param downloadUrl Google Drive 다운로드 URL
 * @param onProgress 다운로드 진행률 콜백 (0~100)
 * @returns 성공 시 true
 */
export async function downloadAndInstallApk(
  downloadUrl: string,
  onProgress?: (percent: number) => void,
): Promise<{ success: boolean; error?: string }> {
  if (Platform.OS !== 'android') return { success: false, error: 'Android 전용' };

  const directUrl = getDirectDownloadUrl(downloadUrl);
  const downloadDir = ReactNativeBlobUtil.fs.dirs.DownloadDir;
  const fileName = `모두의가계부-v${CURRENT_VERSION_CODE + 1}.apk`;
  const filePath = `${downloadDir}/${fileName}`;

  try {
    // 이전 다운로드 파일 정리
    const files = await ReactNativeBlobUtil.fs.ls(downloadDir);
    for (const f of files) {
      if ((f.startsWith('PairBudget-') || f.startsWith('모두의가계부-')) && f.endsWith('.apk')) {
        await ReactNativeBlobUtil.fs.unlink(`${downloadDir}/${f}`).catch(() => {});
      }
    }

    console.log('[UpdateService] APK 다운로드 시작:', directUrl);

    const task = ReactNativeBlobUtil.config({
      path: filePath,
      fileCache: false,
      followRedirect: true,
      timeout: 90000, // 90초 타임아웃
    }).fetch('GET', directUrl, {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36',
    });

    task.progress((received: string, total: string) => {
      const r = Number(received);
      const t = Number(total);
      if (t > 0) {
        onProgress?.(Math.round((r / t) * 100));
      } else {
        const receivedMB = r / (1024 * 1024);
        onProgress?.(Math.min(Math.round((receivedMB / 55) * 100), 99));
      }
    });

    // 타임아웃 래퍼 (90초)
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`다운로드 타임아웃 (90초)\nURL: ${directUrl.substring(0, 80)}...`)), 90000)
    );

    const res = await Promise.race([task, timeoutPromise]);

    const status = res.info().status;
    console.log('[UpdateService] 다운로드 완료, 상태:', status);

    if (status !== 200) {
      await ReactNativeBlobUtil.fs.unlink(filePath).catch(() => {});
      return { success: false, error: `HTTP ${status}` };
    }

    // 파일 크기 검증
    const stat = await ReactNativeBlobUtil.fs.stat(filePath);
    const fileSizeMB = Number(stat.size) / (1024 * 1024);
    console.log('[UpdateService] 다운로드 파일 크기:', fileSizeMB.toFixed(1), 'MB');
    if (fileSizeMB < 5) {
      await ReactNativeBlobUtil.fs.unlink(filePath).catch(() => {});
      return { success: false, error: `파일 크기 이상: ${fileSizeMB.toFixed(1)}MB (HTML 페이지일 수 있음)` };
    }

    onProgress?.(100);

    // 시스템 DownloadManager에 등록 → 시스템 알림으로 설치 유도
    console.log('[UpdateService] 시스템 알림으로 설치 유도:', filePath);
    await ReactNativeBlobUtil.android.addCompleteDownload({
      title: `모두의 가계부 업데이트`,
      description: '탭하여 설치를 진행하세요',
      mime: 'application/vnd.android.package-archive',
      path: filePath,
      showNotification: true,
    });

    return { success: true };
  } catch (error: any) {
    console.error('[UpdateService] APK 다운로드/설치 실패:', error);
    try {
      await ReactNativeBlobUtil.fs.unlink(filePath);
    } catch {}
    return { success: false, error: error?.message || String(error) };
  }
}
