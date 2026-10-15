import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export const referenceDataAPI = {
  getCategories: (): Promise<{ data: any }> =>
    api.get('/reference/categories').then((res) => (res.data ? Promise.resolve({ data: res.data }) : Promise.resolve({ data: res }))),

  getPriorities: (): Promise<{ data: any }> =>
    api.get('/reference/priorities').then((res) => (res.data ? Promise.resolve({ data: res.data }) : Promise.resolve({ data: res }))),

  getShops: (): Promise<{ data: any }> =>
    api.get('/reference/shops').then((res) => (res.data ? Promise.resolve({ data: res.data }) : Promise.resolve({ data: res }))),

  getSubTypes: (): Promise<{ data: any }> =>
    api.get('/reference/sub-types').then((res) => (res.data ? Promise.resolve({ data: res.data }) : Promise.resolve({ data: res }))),

  getRequestTypes: (): Promise<{ data: any }> =>
    api.get('/reference/request-types').then((res) => (res.data ? Promise.resolve({ data: res.data }) : Promise.resolve({ data: res }))),
};

export const useCategories = () => {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const response = await referenceDataAPI.getCategories();
      return response.data;
    },
    retry: 1,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};

export const usePriorities = () => {
  return useQuery({
    queryKey: ['priorities'],
    queryFn: async () => {
      const response = await referenceDataAPI.getPriorities();
      return response.data;
    },
    retry: 1,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};

export const useShops = () => {
  return useQuery({
    queryKey: ['shops'],
    queryFn: async () => {
      const response = await referenceDataAPI.getShops();
      return response.data;
    },
    retry: 1,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};

export const useSubTypes = () => {
  return useQuery({
    queryKey: ['sub-types'],
    queryFn: async () => {
      const response = await referenceDataAPI.getSubTypes();
      return response.data;
    },
    retry: 1,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};

export const useRequestTypes = () => {
  return useQuery({
    queryKey: ['request-types'],
    queryFn: async () => {
      const response = await referenceDataAPI.getRequestTypes();
      return response.data;
    },
    retry: 1,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};