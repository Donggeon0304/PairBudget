/**
 * MonthContext - 홈/내역/통계 화면에서 공유하는 월 선택 상태
 */
import React, { createContext, useContext, useState, useCallback } from 'react';

import { useFiscalCycle } from './FiscalCycleContext';

interface MonthContextType {
  currentMonth: Date;
  setCurrentMonth: (date: Date) => void;
  goToPrevMonth: () => void;
  goToNextMonth: () => void;
  goToThisMonth: () => void;
  monthPickerVisible: boolean;
  setMonthPickerVisible: (v: boolean) => void;
  pickerYear: number;
  setPickerYear: React.Dispatch<React.SetStateAction<number>>;
}

const MonthContext = createContext<MonthContextType | undefined>(undefined);

export const MonthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { enabled, startDay, isLoaded } = useFiscalCycle();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [monthPickerVisible, setMonthPickerVisible] = useState(false);
  const [pickerYear, setPickerYear] = useState(new Date().getFullYear());

  // 설정이 로드되면 현재 사이클에 맞게 초기 월을 설정
  React.useEffect(() => {
    if (isLoaded) {
      const now = new Date();
      if (enabled && now.getDate() < startDay) {
        // 오늘이 시작일보다 전이면 이전 달 사이클
        setCurrentMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));
      } else {
        setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1));
      }
    }
  }, [isLoaded, enabled, startDay]);

  const goToPrevMonth = useCallback(() => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  }, []);

  const goToNextMonth = useCallback(() => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  }, []);

  const goToThisMonth = useCallback(() => {
    const now = new Date();
    if (enabled && now.getDate() < startDay) {
      setCurrentMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    } else {
      setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    }
  }, [enabled, startDay]);

  return (
    <MonthContext.Provider value={{
      currentMonth,
      setCurrentMonth,
      goToPrevMonth,
      goToNextMonth,
      goToThisMonth,
      monthPickerVisible,
      setMonthPickerVisible,
      pickerYear,
      setPickerYear,
    }}>
      {children}
    </MonthContext.Provider>
  );
};

export const useMonth = (): MonthContextType => {
  const context = useContext(MonthContext);
  if (!context) {
    throw new Error('useMonth must be used within a MonthProvider');
  }
  return context;
};
