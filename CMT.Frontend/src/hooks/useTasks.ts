import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { secureAuthStore } from '@/lib/secure-auth-store';

/**
 * Local task types (original code imported these from `@/lib/api`).
 * Defining minimal shapes here so the file is self-contained and TypeScript-safe.
 * If you have richer types in your project, replace these with the canonical ones.
 */
export type CreateTaskRequest = {
  title: string;
  description?: string;
  categoryId?: number;
  priorityId?: number;
  dueDate?: string;
  assigneeId?: number;
  [key: string]: any;
};

export type UpdateTaskRequest = Partial<CreateTaskRequest>;

/**
 * Small helper to build query strings from optional params.
 */
function buildQueryString(params?: Record<string, any>) {
  if (!params) return '';
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (typeof v !== 'undefined' && v !== null) qs.append(k, String(v));
  });
  const s = qs.toString();
  return s ? `?${s}` : '';
}

/**
 * tasksAPI wrapper using the default `api` export.
 * Building URLs manually (instead of passing `{ params }`) avoids issues
 * with some `api` wrappers whose second argument types differ (AbortSignal, etc).
 */
export const tasksAPI = {
  getTasks: (params?: Record<string, any>): Promise<{ data: any }> => {
    const url = `/tasks${buildQueryString(params)}`;
    return api.get(url).then((res: any) => res.data);
  },

  getCompletedTasks: (params?: Record<string, any>): Promise<{ data: any }> => {
    const url = `/tasks/completed${buildQueryString(params)}`;
    return api.get(url).then((res: any) => res.data);
  },

  createTask: (task: CreateTaskRequest): Promise<{ data: any }> =>
    api.post('/tasks', task).then((res: any) => res.data),

  updateTask: (id: number, task: UpdateTaskRequest): Promise<{ data: any }> =>
    api.put(`/tasks/${id}`, task).then((res: any) => res.data),

  deleteTask: (id: number): Promise<void> =>
    api.delete(`/tasks/${id}`).then((res: any) => res.data),

  updateTaskStatus: (id: number, status: string): Promise<{ data: any }> =>
    api.patch(`/tasks/${id}/status`, { status }).then((res: any) => res.data),
};

/**
 * Minimal referenceDataAPI wrapper used by the lower reference-data hooks in this file.
 * If you already have a shared wrapper elsewhere, you can remove this and import that wrapper.
 */
export const referenceDataAPI = {
  getCategories: (): Promise<{ data: any }> =>
    api.get('/reference/categories').then((res: any) => res.data),

  getPriorities: (): Promise<{ data: any }> =>
    api.get('/reference/priorities').then((res: any) => res.data),

  getShops: (): Promise<{ data: any }> =>
    api.get('/reference/shops').then((res: any) => res.data),
};

/**
 * Hooks
 */

export const useTasks = (params?: {
  categoryId?: number;
  status?: string;
  searchQuery?: string;
  priorityId?: number;
  fromDate?: string;
  toDate?: string;
  pageNumber?: number;
  pageSize?: number;
}) => {
  return useQuery({
    queryKey: ['tasks', params],
    queryFn: async () => {
      const response = await tasksAPI.getTasks(params);

      // Ensure proper data structure and provide unique keys for React rendering
      const data = response && response.data ? response.data : response;
      if (Array.isArray(data)) {
        return data.map((task: any, index: number) => ({
          ...task,
          task_id: task.task_id || task.id || task.taskId || index + 1,
          _uniqueId: `task-${task.task_id || task.id || task.taskId || index}-${Date.now()}-${Math.random()
            .toString(36)
            .substring(2, 8)}`,
        }));
      }

      return data;
    },
    staleTime: 1000 * 60 * 2, // 2 minutes
  });
};

export const useCompletedTasks = (params?: {
  categoryId?: number;
  searchQuery?: string;
  priorityId?: number;
  fromDate?: string;
  toDate?: string;
  pageNumber?: number;
  pageSize?: number;
}) => {
  return useQuery({
    queryKey: ['completed-tasks', params],
    queryFn: async () => {
      const response = await tasksAPI.getCompletedTasks(params);

      const data = response && response.data ? response.data : response;
      if (Array.isArray(data)) {
        return data.map((task: any, index: number) => ({
          ...task,
          task_id: task.task_id || task.id || task.taskId || index + 1,
          _uniqueId: `completed-task-${task.task_id || task.id || task.taskId || index}-${Date.now()}-${Math.random()
            .toString(36)
            .substring(2, 8)}`,
        }));
      }

      return data;
    },
    staleTime: 1000 * 60 * 2, // 2 minutes
  });
};

export const useCreateTask = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (taskData: CreateTaskRequest) => {
      try {
        // SECURITY: get current user from in-memory store, not localStorage
        const currentUser = secureAuthStore.getUser() || {};
        const taskWithCreatedBy = {
          ...taskData,
          createdBy: (currentUser && (currentUser.userId || currentUser.user_id)) || 1,
        };

        const response = await tasksAPI.createTask(taskWithCreatedBy);

        const created = response && response.data ? response.data : response;

        const createdTask = {
          ...created,
          task_id: created.task_id || created.id || created.taskId,
          _uniqueId: `new-task-${created.task_id || created.id || Date.now()}-${Math.random()
            .toString(36)
            .substring(2, 8)}`,
        };

        return createdTask;
      } catch (error: any) {
        console.error('Task creation error:', error);
        console.error('Error response:', error?.response?.data);
        throw error;
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ['tasks'],
        exact: false,
      });
      queryClient.invalidateQueries({
        queryKey: ['completed-tasks'],
        exact: false,
      });

      // Optionally update cache directly
      queryClient.setQueriesData(
        { queryKey: ['tasks'], exact: false },
        (oldData: any) => {
          if (Array.isArray(oldData)) {
            return [data, ...oldData];
          } else if (oldData?.tasks && Array.isArray(oldData.tasks)) {
            return {
              ...oldData,
              tasks: [data, ...oldData.tasks],
            };
          }
          return oldData;
        }
      );

      window.dispatchEvent(new CustomEvent('tasks:refresh'));
    },
    onError: (error) => {
      console.error('Failed to create task:', error);
    },
  });
};

export const useUpdateTask = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, taskData }: { id: number; taskData: UpdateTaskRequest }) => {
      const response = await tasksAPI.updateTask(id, taskData);

      const updated = response && response.data ? response.data : response;
      const updatedTask = {
        ...updated,
        task_id: updated.task_id || updated.id || updated.taskId || id,
        _uniqueId: `updated-task-${updated.task_id || updated.id || id}-${Date.now()}-${Math.random()
          .toString(36)
          .substring(2, 8)}`,
      };

      return updatedTask;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['tasks'],
        exact: false,
      });
      queryClient.invalidateQueries({
        queryKey: ['completed-tasks'],
        exact: false,
      });

      window.dispatchEvent(new CustomEvent('tasks:refresh'));
    },
  });
};

export const useDeleteTask = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      await tasksAPI.deleteTask(id);
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['tasks'],
        exact: false,
      });
      queryClient.invalidateQueries({
        queryKey: ['completed-tasks'],
        exact: false,
      });

      window.dispatchEvent(new CustomEvent('tasks:refresh'));
    },
  });
};

export const useUpdateTaskStatus = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const response = await tasksAPI.updateTaskStatus(id, status);
      const data = response && response.data ? response.data : response;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['tasks'],
        exact: false,
      });
      queryClient.invalidateQueries({
        queryKey: ['completed-tasks'],
        exact: false,
      });

      window.dispatchEvent(new CustomEvent('tasks:refresh'));
    },
  });
};

// Reference data hooks

export const useCategories = () => {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const response = await referenceDataAPI.getCategories();
      return response && response.data ? response.data : response;
    },
    staleTime: 1000 * 60 * 10, // 10 minutes
  });
};

export const usePriorities = () => {
  return useQuery({
    queryKey: ['priorities'],
    queryFn: async () => {
      const response = await referenceDataAPI.getPriorities();
      return response && response.data ? response.data : response;
    },
    staleTime: 1000 * 60 * 10, // 10 minutes
  });
};

export const useShops = () => {
  return useQuery({
    queryKey: ['shops'],
    queryFn: async () => {
      const response = await referenceDataAPI.getShops();
      return response && response.data ? response.data : response;
    },
    staleTime: 1000 * 60 * 10, // 10 minutes
  });
};