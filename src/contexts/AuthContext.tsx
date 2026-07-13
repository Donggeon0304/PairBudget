import React, {createContext, useContext, useState, useEffect, ReactNode} from 'react';
import auth, {FirebaseAuthTypes} from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import {User} from '../types';

interface AuthContextType {
  user: User | null;
  firebaseUser: FirebaseAuthTypes.User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isGoogleLinked: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  linkWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  updateUserProfile: (data: Partial<User>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({children}) => {
  // Google Sign-In 초기화
  GoogleSignin.configure({
    webClientId: '52395981190-bcmb8islq0nbttfngnfcah9dnrlkcdpj.apps.googleusercontent.com',
  });
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseAuthTypes.User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = auth().onAuthStateChanged(async (fbUser) => {
      if (fbUser) {
        setFirebaseUser(fbUser);
        try {
          const userDoc = await firestore().collection('users').doc(fbUser.uid).get();
          if (userDoc.exists()) {
            const userData = userDoc.data();
            setUser({
              uid: fbUser.uid,
              displayName: userData?.displayName || fbUser.displayName || '',
              email: userData?.email || fbUser.email || '',
              photoURL: userData?.photoURL || fbUser.photoURL || undefined,
              householdId: userData?.householdId || undefined,
              createdAt: userData?.createdAt?.toDate() || new Date(),
            });
          } else {
            const newUser: User = {
              uid: fbUser.uid,
              displayName: fbUser.displayName || '',
              email: fbUser.email || '',
              photoURL: fbUser.photoURL || undefined,
              createdAt: new Date(),
            };
            await firestore().collection('users').doc(fbUser.uid).set({
              ...newUser,
              createdAt: firestore.FieldValue.serverTimestamp(),
            });
            setUser(newUser);
          }
        } catch (error: any) {
          console.error('Error fetching user data:', error);
          setUser({
            uid: fbUser.uid,
            displayName: fbUser.displayName || '',
            email: fbUser.email || '',
            photoURL: fbUser.photoURL || undefined,
            createdAt: new Date(),
          });
        }
      } else {
        setFirebaseUser(null);
        setUser(null);
      }
      setIsLoading(false);
    });
    return unsubscribe;
  }, []);

  const login = async (email: string, password: string): Promise<void> => {
    setIsLoading(true);
    try {
      await auth().signInWithEmailAndPassword(email, password);
    } catch (error: any) {
      setIsLoading(false);
      throw new Error(getAuthErrorMessage(error.code));
    }
  };

  const register = async (
    email: string,
    password: string,
    displayName: string,
  ): Promise<void> => {
    setIsLoading(true);
    try {
      const credential = await auth().createUserWithEmailAndPassword(email, password);
      await credential.user.updateProfile({displayName});
      await firestore().collection('users').doc(credential.user.uid).set({
        uid: credential.user.uid,
        displayName,
        email,
        createdAt: firestore.FieldValue.serverTimestamp(),
      });
    } catch (error: any) {
      setIsLoading(false);
      throw new Error(getAuthErrorMessage(error.code));
    }
  };

  const loginWithGoogle = async (): Promise<void> => {
    setIsLoading(true);
    try {
      await GoogleSignin.hasPlayServices();
      const signInResult = await GoogleSignin.signIn();
      const idToken = signInResult?.data?.idToken;
      if (!idToken) throw new Error('Google 로그인 토큰을 가져올 수 없습니다.');
      const credential = auth.GoogleAuthProvider.credential(idToken);
      await auth().signInWithCredential(credential);
    } catch (error: any) {
      setIsLoading(false);
      throw new Error(error.message || 'Google 로그인에 실패했습니다.');
    }
  };

  const linkWithGoogle = async (): Promise<void> => {
    if (!firebaseUser) throw new Error('로그인이 필요합니다.');
    try {
      await GoogleSignin.hasPlayServices();
      const signInResult = await GoogleSignin.signIn();
      const idToken = signInResult?.data?.idToken;
      if (!idToken) throw new Error('Google 토큰을 가져올 수 없습니다.');
      const credential = auth.GoogleAuthProvider.credential(idToken);
      await firebaseUser.linkWithCredential(credential);
    } catch (error: any) {
      if (error.code === 'auth/credential-already-in-use') {
        throw new Error('이 Google 계정은 이미 다른 계정에 연동되어 있습니다.');
      }
      throw new Error(error.message || 'Google 연동에 실패했습니다.');
    }
  };

  const isGoogleLinked = firebaseUser?.providerData?.some(
    p => p.providerId === 'google.com'
  ) || false;

  const logout = async (): Promise<void> => {
    try {
      await auth().signOut();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const updateUserProfile = async (data: Partial<User>): Promise<void> => {
    if (!firebaseUser) return;
    await firestore().collection('users').doc(firebaseUser.uid).update(data);
    setUser(prev => (prev ? {...prev, ...data} : null));
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        firebaseUser,
        isLoading,
        isAuthenticated: !!user,
        isGoogleLinked,
        login,
        register,
        loginWithGoogle,
        linkWithGoogle,
        logout,
        updateUserProfile,
      }}>
      {children}
    </AuthContext.Provider>
  );
};

function getAuthErrorMessage(code: string): string {
  switch (code) {
    case 'auth/email-already-in-use':
      return '이미 사용 중인 아이디입니다';
    case 'auth/invalid-email':
      return '잘못된 이메일 형식입니다';
    case 'auth/weak-password':
      return '비밀번호는 6자 이상이어야 합니다';
    case 'auth/user-not-found':
      return '사용자를 찾을 수 없습니다';
    case 'auth/wrong-password':
      return '비밀번호가 틀렸습니다';
    case 'auth/too-many-requests':
      return '시도 횟수 초과. 잠시 후 다시 시도하세요';
    default:
      return '인증 오류가 발생했습니다';
  }
}

export default AuthContext;
