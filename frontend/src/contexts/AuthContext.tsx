import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { apiFetch, getStoredToken, setStoredToken } from '../api/client';
import { AppNotification, User } from '../types';

interface PendingCheckIn {
  activityId: number;
  pin: string;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  notifications: AppNotification[];
  unreadCount: number;
  totalPoints: number;
  pendingRegisterActivityId: number | null;
  setPendingRegisterActivityId: (id: number | null) => void;
  pendingCheckIn: PendingCheckIn | null;
  setPendingCheckIn: (payload: PendingCheckIn | null) => void;
  setSession: (token: string, user: User) => Promise<void>;
  logout: () => void;
  refreshUserData: () => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [totalPoints, setTotalPoints] = useState(0);
  const [pendingRegisterActivityId, setPendingRegisterActivityId] = useState<number | null>(null);
  const [pendingCheckIn, setPendingCheckIn] = useState<PendingCheckIn | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const actParam = Number(params.get('checkinActivity'));
    const pinParam = (params.get('pin') || '').trim();
    if (Number.isInteger(actParam) && actParam > 0 && /^\d{6}$/.test(pinParam)) {
      setPendingCheckIn({ activityId: actParam, pin: pinParam });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const refreshUserData = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      setUser(null);
      setNotifications([]);
      setTotalPoints(0);
      setLoading(false);
      return;
    }

    try {
      const meRes = await apiFetch<{ user: User }>('/users/me');
      setUser(meRes.user);

      const notifRes = await apiFetch<{ notifications: AppNotification[] }>('/notifications');
      setNotifications(notifRes.notifications);

      if (meRes.user.role === 'STUDENT') {
        const ptsRes = await apiFetch<{ totalPoints: number }>('/student/points');
        setTotalPoints(ptsRes.totalPoints);
      } else {
        setTotalPoints(0);
      }
    } catch {
      setStoredToken(null);
      setUser(null);
      setNotifications([]);
      setTotalPoints(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUserData();
  }, [refreshUserData]);

  const setSession = async (token: string, newUser: User) => {
    setStoredToken(token);
    setUser(newUser);
    await refreshUserData();
  };

  const logout = () => {
    setStoredToken(null);
    setUser(null);
    setNotifications([]);
    setTotalPoints(0);
    setPendingRegisterActivityId(null);
    setPendingCheckIn(null);
  };

  const markAllNotificationsRead = async () => {
    await apiFetch('/notifications/read-all', { method: 'POST' });
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
  };

  const unreadCount = notifications.filter((n) => n.is_read === 0).length;

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        notifications,
        unreadCount,
        totalPoints,
        pendingRegisterActivityId,
        setPendingRegisterActivityId,
        pendingCheckIn,
        setPendingCheckIn,
        setSession,
        logout,
        refreshUserData,
        markAllNotificationsRead
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
