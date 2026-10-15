import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export const performanceAPI = {
  getTaskStatistics: (): Promise<{ data: any }> =>
    api.get('/performance/task-statistics').then((res) => res.data ? Promise.resolve({ data: res.data }) : Promise.resolve({ data: res })),

  getPerformanceMetrics: (): Promise<{ data: any }> =>
    api.get('/performance/metrics').then((res) => res.data ? Promise.resolve({ data: res.data }) : Promise.resolve({ data: res })),

  getUserPerformance: (userId?: number): Promise<{ data: any }> => {
    const url = userId ? `/performance/users/${userId}` : '/performance/users';
    return api.get(url).then((res) => res.data ? Promise.resolve({ data: res.data }) : Promise.resolve({ data: res }));
  },
};

export const useTaskStatistics = () => {
  return useQuery({
    queryKey: ['task-statistics'],
    queryFn: async () => {
      const response = await performanceAPI.getTaskStatistics();
      return response.data;
    },
    retry: 1,
    staleTime: 1000 * 60 * 2, // 2 minutes
  });
};

export const usePerformanceMetrics = () => {
  return useQuery({
    queryKey: ['performance-metrics'],
    queryFn: async () => {
      const response = await performanceAPI.getPerformanceMetrics();
      return response.data;
    },
    retry: 1,
    staleTime: 1000 * 60 * 2, // 2 minutes
  });
};

export const useUserPerformance = (userId?: number) => {
  return useQuery({
    queryKey: ['user-performance', userId],
    queryFn: async () => {
      const response = await performanceAPI.getUserPerformance(userId);
      return response.data;
    },
    enabled: !!userId,
    retry: 1,
    staleTime: 1000 * 60 * 2, // 2 minutes
  });
};