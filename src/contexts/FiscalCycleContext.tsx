/**
 * FiscalCycleContext - 커스텀 기간 설정 (월급 사이클)
 * 사용자가 시작일을 설정하면 해당 시작일 기준으로 월별 날짜 범위를 계산
 */
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@PairBudget:fiscalCycle';

interface FiscalCycleContextType {
  /** 커스텀 사이클 사용 여부 */
  enabled: boolean;
  /** 시작일 (1~28) */
  startDay: number;
  /** 설정 변경 */
  setFiscalCycle: (enabled: boolean, startDay: number) => void;
  /** 주어진 month Date 기준으로 시작일/종료일 계산 */
  getDateRange: (month: Date) => { start: Date; end: Date };
  /** 주어진 month Date 기준으로 라벨 생성 */
  getMonthDisplayLabel: (month: Date) => string;
  /** 설정 로딩 완료 여부 */
  isLoaded: boolean;
}

const FiscalCycleContext = createContext<FiscalCycleContextType | undefined>(undefined);

export const FiscalCycleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [enabled, setEnabled] = useState(false);
  const [startDay, setStartDay] = useState(1);
  const [isLoaded, setIsLoaded] = useState(false);

  // AsyncStorage에서 설정 복원
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          setEnabled(parsed.enabled ?? false);
          setStartDay(parsed.startDay ?? 1);
        }
      } catch (e) {
        console.warn('[FiscalCycle] Failed to load settings:', e);
      } finally {
        setIsLoaded(true);
      }
    })();
  }, []);

  const setFiscalCycle = useCallback(async (newEnabled: boolean, newStartDay: number) => {
    const clampedDay = Math.max(1, Math.min(28, newStartDay));
    setEnabled(newEnabled);
    setStartDay(clampedDay);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({
        enabled: newEnabled,
        startDay: clampedDay,
      }));
    } catch (e) {
      console.warn('[FiscalCycle] Failed to save settings:', e);
    }
  }, []);

  /**
   * month = 사용자가 선택한 "기준 월" (예: 2026-06-01)
   * enabled=false → 6/1 ~ 6/30
   * enabled=true, startDay=25 → 6/25 ~ 7/24
   */
  const getDateRange = useCallback((month: Date): { start: Date; end: Date } => {
    const year = month.getFullYear();
    const m = month.getMonth();

    if (!enabled || startDay === 1) {
      // 기본: 1일 ~ 말일
      return {
        start: new Date(year, m, 1, 0, 0, 0, 0),
        end: new Date(year, m + 1, 0, 23, 59, 59, 999),
      };
    }

    // 커스텀: startDay일 ~ 익월 (startDay-1)일
    const start = new Date(year, m, startDay, 0, 0, 0, 0);

    // 종료일: 다음 달의 (startDay - 1)일
    let endYear = year;
    let endMonth = m + 1;
    if (endMonth > 11) {
      endMonth = 0;
      endYear += 1;
    }
    // endDay = startDay - 1, 단 해당 월의 마지막 날보다 크면 마지막 날로
    const endDay = startDay - 1;
    const lastDayOfEndMonth = new Date(endYear, endMonth + 1, 0).getDate();
    const actualEndDay = Math.min(endDay, lastDayOfEndMonth);

    const end = new Date(endYear, endMonth, actualEndDay, 23, 59, 59, 999);

    return { start, end };
  }, [enabled, startDay]);

  const getMonthDisplayLabel = useCallback((month: Date): string => {
    const year = month.getFullYear();
    const m = month.getMonth() + 1;

    if (!enabled || startDay === 1) {
      return `${year}년 ${m}월`;
    }

    return `${year}년 ${m}월 (${startDay}일~)`;
  }, [enabled, startDay]);

  return (
    <FiscalCycleContext.Provider value={{
      enabled,
      startDay,
      setFiscalCycle,
      getDateRange,
      getMonthDisplayLabel,
      isLoaded,
    }}>
      {children}
    </FiscalCycleContext.Provider>
  );
};

export const useFiscalCycle = (): FiscalCycleContextType => {
  const context = useContext(FiscalCycleContext);
  if (!context) {
    throw new Error('useFiscalCycle must be used within a FiscalCycleProvider');
  }
  return context;
};
