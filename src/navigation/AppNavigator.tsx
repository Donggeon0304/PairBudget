import React, { useRef, useEffect } from 'react';
import {NavigationContainer, NavigationContainerRef} from '@react-navigation/native';
import {createStackNavigator} from '@react-navigation/stack';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import { StyleSheet, View, ActivityIndicator, Text, AppState, Image } from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';

import {useAuth} from '../contexts/AuthContext';
import {useHousehold} from '../contexts/HouseholdContext';
import {MonthProvider} from '../contexts/MonthContext';
import {FiscalCycleProvider} from '../contexts/FiscalCycleContext';
import {Colors} from '../theme/colors';
import notifee, { EventType } from '@notifee/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Auth Screens
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';

// Household Screens
import CreateHouseholdScreen from '../screens/household/CreateHouseholdScreen';
import JoinHouseholdScreen from '../screens/household/JoinHouseholdScreen';

// Main Screens
import DashboardScreen from '../screens/main/DashboardScreen';
import TransactionListScreen from '../screens/main/TransactionListScreen';
import AddTransactionScreen from '../screens/main/AddTransactionScreen';
import StatsScreen from '../screens/main/StatsScreen';
import SettingsScreen from '../screens/main/SettingsScreen';

// Notification Screen
import PendingTransactionsScreen from '../screens/notification/PendingTransactionsScreen';

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

export type HouseholdStackParamList = {
  CreateHousehold: undefined;
  JoinHousehold: undefined;
};

export type MainTabParamList = {
  Dashboard: undefined;
  Transactions: undefined;
  Add: undefined;
  Stats: undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  MainTabs: undefined;
  AddTransaction: {editTransaction?: any} | undefined;
  PendingTransactions: undefined;
};

const AuthStack = createStackNavigator<AuthStackParamList>();
const HouseholdStack = createStackNavigator<HouseholdStackParamList>();
const MainTab = createBottomTabNavigator<MainTabParamList>();
const RootStack = createStackNavigator<RootStackParamList>();

const tabIconMap: Record<string, {outline: string; filled: string}> = {
  Dashboard: {outline: 'home-outline', filled: 'home'},
  Transactions: {outline: 'receipt-outline', filled: 'receipt'},
  Add: {outline: 'add-circle-outline', filled: 'add-circle'},
  Stats: {outline: 'stats-chart-outline', filled: 'stats-chart'},
  Settings: {outline: 'settings-outline', filled: 'settings'},
};

const TabIcon = ({name, focused}: {name: string; focused: boolean}) => {
  const icons = tabIconMap[name] || {outline: 'ellipse-outline', filled: 'ellipse'};
  const iconName = focused ? icons.filled : icons.outline;

  return (
    <Icon
      name={iconName}
      size={24}
      color={focused ? Colors.Primary : Colors.TextMuted}
    />
  );
};

const MainTabs = () => {
  const insets = useSafeAreaInsets();
  return (
    <FiscalCycleProvider>
    <MonthProvider>
    <MainTab.Navigator
      screenOptions={({route}) => ({
        headerShown: false,
        tabBarStyle: {
          ...styles.tabBar,
          height: 60 + insets.bottom,
          paddingBottom: insets.bottom + 4,
        },
        tabBarActiveTintColor: Colors.Primary,
        tabBarInactiveTintColor: Colors.TextMuted,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({focused}) => (
          <TabIcon name={route.name} focused={focused} />
        ),
      })}>
      <MainTab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{tabBarLabel: '홈'}}
      />
      <MainTab.Screen
        name="Transactions"
        component={TransactionListScreen}
        options={{tabBarLabel: '내역'}}
      />
      <MainTab.Screen
        name="Add"
        component={AddTransactionScreen}
        options={{tabBarLabel: '등록'}}
      />
      <MainTab.Screen
        name="Stats"
        component={StatsScreen}
        options={{tabBarLabel: '통계'}}
      />
      <MainTab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{tabBarLabel: '설정'}}
      />
    </MainTab.Navigator>
    </MonthProvider>
    </FiscalCycleProvider>
  );
};

const AuthNavigator = () => {
  return (
    <AuthStack.Navigator
      screenOptions={{
        headerShown: false,
        cardStyle: {backgroundColor: Colors.Background},
      }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
    </AuthStack.Navigator>
  );
};

const HouseholdNavigator = () => {
  return (
    <HouseholdStack.Navigator
      screenOptions={{
        headerShown: false,
        cardStyle: {backgroundColor: Colors.Background},
      }}>
      <HouseholdStack.Screen
        name="CreateHousehold"
        component={CreateHouseholdScreen}
      />
      <HouseholdStack.Screen
        name="JoinHousehold"
        component={JoinHouseholdScreen}
      />
    </HouseholdStack.Navigator>
  );
};

const MainNavigator = () => {
  return (
    <RootStack.Navigator
      screenOptions={{
        headerShown: false,
        cardStyle: {backgroundColor: Colors.Background},
      }}>
      <RootStack.Screen name="MainTabs" component={MainTabs} />
      <RootStack.Screen
        name="AddTransaction"
        component={AddTransactionScreen}
        options={{
          presentation: 'modal',
          gestureEnabled: true,
        }}
      />
      <RootStack.Screen
        name="PendingTransactions"
        component={PendingTransactionsScreen}
      />
    </RootStack.Navigator>
  );
};

const LoadingScreen = () => (
  <View style={styles.loadingContainer}>
    <View style={styles.logoWrapper}>
      <Image
        source={require('../assets/images/logo.png')}
        style={styles.loadingLogo}
      />
    </View>
    <ActivityIndicator size="small" color={Colors.Primary} style={styles.spinner} />
    <Text style={styles.loadingText}>가계부를 불러오고 있어요</Text>
  </View>
);

const AppNavigator: React.FC = () => {
  const {isAuthenticated, isLoading: authLoading} = useAuth();
  const {hasHousehold, isLoading: householdLoading} = useHousehold();
  const navigationRef = useRef<NavigationContainerRef<any>>(null);
  const isNavReady = useRef(false);
  const pendingNavigate = useRef(false);

  // navigation이 ready되면 대기 중인 navigate 실행
  const navigateToPending = () => {
    if (isNavReady.current && navigationRef.current) {
      navigationRef.current.navigate('PendingTransactions');
    } else {
      pendingNavigate.current = true;
    }
  };

  const onNavReady = () => {
    isNavReady.current = true;
    if (pendingNavigate.current) {
      pendingNavigate.current = false;
      // 약간 딜레이 후 navigate (스택이 완전히 마운트될 때까지)
      setTimeout(() => {
        navigationRef.current?.navigate('PendingTransactions');
      }, 300);
    }
  };

  // 1) 포그라운드: 앱이 열려있을 때 알림 탭
  
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextAppState) => {
      if (nextAppState === 'active') {
        try {
          const pendingNav = await AsyncStorage.getItem('pending_notification_nav');
          if (pendingNav === 'true') {
            await AsyncStorage.removeItem('pending_notification_nav');
            navigateToPending();
          }
        } catch (e) {
          console.log(e);
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    return notifee.onForegroundEvent(({ type }) => {
      if (type === EventType.PRESS) {
        navigateToPending();
      }
    });
  }, []);

  // 2) 콜드스타트: 앱이 완전히 꺼진 상태에서 알림 탭으로 열림
  useEffect(() => {
    notifee.getInitialNotification().then(async (initialNotification) => {
      if (initialNotification) {
        navigateToPending();
        // 처리 후 초기 알림 소비 (재실행 시 다시 이동 방지)
        try {
          await notifee.cancelNotification(initialNotification.notification.id!);
        } catch {}
      }
    });
  }, []);

  if (authLoading || (isAuthenticated && householdLoading)) {
    return <LoadingScreen />;
  }

  return (
    <NavigationContainer
      ref={navigationRef}
      onReady={onNavReady}
      theme={{
        dark: false,
        colors: {
          primary: Colors.Primary,
          background: Colors.Background,
          card: Colors.Surface,
          text: Colors.Text,
          border: Colors.Divider,
          notification: Colors.Accent,
        },
        fonts: {
          regular: {fontFamily: 'System', fontWeight: '400' as const},
          medium: {fontFamily: 'System', fontWeight: '500' as const},
          bold: {fontFamily: 'System', fontWeight: '700' as const},
          heavy: {fontFamily: 'System', fontWeight: '900' as const},
        },
      }}>
      {!isAuthenticated ? (
        <AuthNavigator />
      ) : !hasHousehold ? (
        <HouseholdNavigator />
      ) : (
        <MainNavigator />
      )}
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.Surface,
    borderTopColor: Colors.CardBorder,
    borderTopWidth: 0.5,
    height: 90,
    paddingBottom: 24,
    paddingTop: 8,
    elevation: 4,
    shadowColor: '#4A4A6A',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.Background,
  },
  logoWrapper: {
    width: 100,
    height: 100,
    borderRadius: 24,
    backgroundColor: Colors.Surface,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#4A4A6A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
    marginBottom: 24,
  },
  loadingLogo: {
    width: 80,
    height: 80,
  },
  spinner: {
    marginBottom: 12,
  },
  loadingText: {
    color: Colors.TextSecondary,
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: -0.3,
  },
});

export default AppNavigator;
