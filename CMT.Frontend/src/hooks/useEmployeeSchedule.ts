import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

export interface EmployeeSchedule {
  scheduleId: number;
  userId: number;
  employeeName: string;
  scheduleDate: string;
  startTime: string;
  endTime: string;
  shiftType: string;
  comments?: string;
  status: 'Draft' | 'Approved' | 'Locked';
  approvedBy?: string;
  approvalDate?: string;
}

export interface CreateScheduleRequest {
  userId: number;
  scheduleDate: string;
  startTime: string;
  endTime: string;
  shiftType: string;
  comments?: string;
}

// Employee Schedule API
export const employeeScheduleAPI = {
  getSchedules: (params?: {
    weekStarting?: string;
    userId?: number;
    status?: string;
  }): Promise<{ data: EmployeeSchedule[] }> => {
    // Build query string manually to avoid passing a `params` option
    // which may not be supported by the `api` wrapper in this codebase.
    const qs = new URLSearchParams();
    if (params) {
      if (params.weekStarting) qs.append('weekStarting', params.weekStarting);
      if (typeof params.userId !== 'undefined') qs.append('userId', String(params.userId));
      if (params.status) qs.append('status', params.status);
    }
    const url = qs.toString() ? `/employee-schedules?${qs.toString()}` : '/employee-schedules';
    return api.get(url).then(response => response.data);
  },

  createSchedule: (schedule: CreateScheduleRequest): Promise<{ data: EmployeeSchedule }> =>
    api.post('/employee-schedules', schedule).then(response => response.data),

  updateSchedule: (id: number, schedule: Partial<CreateScheduleRequest>): Promise<{ data: EmployeeSchedule }> =>
    api.put(`/employee-schedules/${id}`, schedule).then(response => response.data),

  deleteSchedule: (id: number): Promise<void> =>
    api.delete(`/employee-schedules/${id}`).then(response => response.data),

  approveSchedule: (id: number): Promise<{ data: EmployeeSchedule }> =>
    api.patch(`/employee-schedules/${id}/approve`).then(response => response.data),
};

export const useEmployeeSchedules = (params?: {
  weekStarting?: string;
  userId?: number;
  status?: string;
}) => {
  return useQuery({
    queryKey: ['employeeSchedules', params],
    queryFn: () => employeeScheduleAPI.getSchedules(params),
    select: (data) => data.data,
  });
};

export const useCreateEmployeeSchedule = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (schedule: CreateScheduleRequest) => employeeScheduleAPI.createSchedule(schedule),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employeeSchedules'] });
    },
  });
};

export const useUpdateEmployeeSchedule = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, schedule }: { id: number; schedule: Partial<CreateScheduleRequest> }) =>
      employeeScheduleAPI.updateSchedule(id, schedule),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employeeSchedules'] });
    },
  });
};

export const useDeleteEmployeeSchedule = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => employeeScheduleAPI.deleteSchedule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employeeSchedules'] });
    },
  });
};