import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

export interface Shop {
  shopId: number;
  name: string;
  description?: string;
}

export interface TaskTransfer {
  transferId: number;
  taskId: number;
  taskDescription: string;
  fromShopName: string;
  toShopName: string;
  transferredBy: string;
  status: 'Pending' | 'Accepted' | 'Rejected' | 'Cancelled';
  comments?: string;
  createdAt: string;
  actionBy?: string;
  actionAt?: string;
}

export interface CreateTransferRequest {
  taskId: number;
  fromShopId: number;
  toShopId: number;
  comments: string;
}

// Task Transfer API
export const taskTransferAPI = {
  getTransfers: (params?: {
    status?: string;
    fromShopId?: number;
    toShopId?: number;
  }): Promise<{ data: TaskTransfer[] }> => {
    // Build query string manually to avoid passing a `params` option which may not be
    // supported by the `api` wrapper in this codebase (some wrappers expect an AbortSignal).
    const qs = new URLSearchParams();
    if (params) {
      if (params.status) qs.append('status', params.status);
      if (typeof params.fromShopId !== 'undefined') qs.append('fromShopId', String(params.fromShopId));
      if (typeof params.toShopId !== 'undefined') qs.append('toShopId', String(params.toShopId));
    }
    const url = qs.toString() ? `/task-transfers?${qs.toString()}` : '/task-transfers';
    return api.get(url).then(response => response.data);
  },

  createTransfer: (transfer: CreateTransferRequest): Promise<{ data: TaskTransfer }> =>
    api.post('/task-transfers', transfer).then(response => response.data),

  acceptTransfer: (transferId: number): Promise<{ data: TaskTransfer }> =>
    api.patch(`/task-transfers/${transferId}/accept`).then(response => response.data),

  rejectTransfer: (transferId: number, reason?: string): Promise<{ data: TaskTransfer }> =>
    api.patch(`/task-transfers/${transferId}/reject`, { reason }).then(response => response.data),

  cancelTransfer: (transferId: number): Promise<{ data: TaskTransfer }> =>
    api.patch(`/task-transfers/${transferId}/cancel`).then(response => response.data),
};

export const useTaskTransfers = (params?: {
  status?: string;
  fromShopId?: number;
  toShopId?: number;
}) => {
  return useQuery({
    queryKey: ['taskTransfers', params],
    queryFn: () => taskTransferAPI.getTransfers(params),
    select: (data) => data.data,
  });
};

export const useCreateTaskTransfer = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (transfer: CreateTransferRequest) => taskTransferAPI.createTransfer(transfer),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taskTransfers'] });
    },
  });
};

export const useAcceptTaskTransfer = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (transferId: number) => taskTransferAPI.acceptTransfer(transferId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taskTransfers'] });
    },
  });
};

export const useRejectTaskTransfer = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ transferId, reason }: { transferId: number; reason?: string }) =>
      taskTransferAPI.rejectTransfer(transferId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taskTransfers'] });
    },
  });
};