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
export const CURRENT_VERSION_CODE = 25;
export const CURRENT_VERSION_NAME = '1.24';

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
export function getDirectDownloadUrl(url: string): string {
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
    return `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t&t=${Date.now()}`;
  }

  return url;
}

/**
 * 시스템 DownloadManager로 APK 다운로드 (앱을 벗어나지 않음)
 * GitHub Releases URL에 최적화
 */
export async function downloadApkViaManager(
  downloadUrl: string,
): Promise<{ success: boolean; error?: string }> {
  if (Platform.OS !== 'android') return { success: false, error: 'Android 전용' };

  try {
    const downloadDir = ReactNativeBlobUtil.fs.dirs.DownloadDir;
    const fileName = `PairBudget-v${CURRENT_VERSION_CODE + 1}.apk`;
    const filePath = `${downloadDir}/${fileName}`;

    // 이전 APK 정리
    const files = await ReactNativeBlobUtil.fs.ls(downloadDir);
    for (const f of files) {
      if ((f.startsWith('PairBudget-') || f.startsWith('모두의가계부-')) && f.endsWith('.apk')) {
        await ReactNativeBlobUtil.fs.unlink(`${downloadDir}/${f}`).catch(() => {});
      }
    }

    console.log('[UpdateService] DownloadManager 다운로드 시작:', downloadUrl);

    await ReactNativeBlobUtil.config({
      path: filePath,
      fileCache: false,
      followRedirect: true,
      addAndroidDownloads: {
        useDownloadManager: true,
        title: '모두의 가계부 업데이트',
        description: '다운로드 완료 후 탭하여 설치하세요',
        mime: 'application/vnd.android.package-archive',
        mediaScannable: false,
        notification: true,
        path: filePath,
      },
    }).fetch('GET', downloadUrl);

    console.log('[UpdateService] DownloadManager 요청 완료');
    return { success: true };
  } catch (error: any) {
    console.error('[UpdateService] DownloadManager 실패:', error);
    return { success: false, error: error?.message || String(error) };
  }
}
