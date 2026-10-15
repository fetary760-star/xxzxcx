'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTimezone } from '@/lib/timezone-context';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Calendar, Clock, Plus, Edit, Trash2 } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { apiClient, usersAPI } from '@/lib/api';

interface EmployeeSchedule {
  schedule_id: number;
  user_id: number;
  employee_name: string;
  schedule_date: string;
  start_time: string;
  end_time: string;
  shift_type: string;
  comments?: string;
  status: 'Draft' | 'Approved' | 'Locked';
  approved_by?: string;
  approval_date?: string;
}

interface User {
  user_id: number;
  full_name: string;
  role: string;
}

const EmployeeScheduleManagement = () => {
  const { formatDate } = useTimezone();
  const [schedules, setSchedules] = useState<EmployeeSchedule[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<EmployeeSchedule | null>(null);
  const [selectedWeek, setSelectedWeek] = useState(getCurrentWeek());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch users and schedules from API (replaces previous mock data)
  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        // Fetch users
        try {
          const usersRes: any = await usersAPI.getUsers({}); // expected to return an array or object containing users
          let usersList: any[] = [];

          if (Array.isArray(usersRes)) {
            usersList = usersRes;
          } else if (Array.isArray(usersRes.users)) {
            usersList = usersRes.users;
          } else if (Array.isArray(usersRes.data)) {
            usersList = usersRes.data;
          } else {
            // fallback if returned shape is a single object
            usersList = usersRes || [];
          }

          if (mounted) {
            setUsers(
              usersList.map((u: any) => ({
                user_id: u.user_id ?? u.id ?? u.userId,
                full_name: u.full_name ?? u.fullName ?? u.name,
                role: u.role ?? u.user_role ?? 'engineer',
              }))
            );
          }
        } catch (uErr) {
          // non-fatal: continue and try to fetch schedules
          console.error('Failed to load users:', uErr);
        }

        // Fetch schedules for the selected week
        try {
          // The backend endpoint name may vary. We call /schedules and pass week as query param.
          // Adjust this endpoint if your API uses a different path (e.g., /employee-schedules).
          const query = selectedWeek ? `?week=${encodeURIComponent(selectedWeek)}` : '';
          const schedulesRes: any = await apiClient.get(`/schedules${query}`);

          let scheduleList: any[] = [];
          if (Array.isArray(schedulesRes)) {
            scheduleList = schedulesRes;
          } else if (Array.isArray(schedulesRes.schedules)) {
            scheduleList = schedulesRes.schedules;
          } else if (Array.isArray(schedulesRes.data)) {
            scheduleList = schedulesRes.data;
          } else {
            scheduleList = schedulesRes || [];
          }

          if (mounted) {
            // Attempt to normalize each schedule to EmployeeSchedule shape
            setSchedules(
              scheduleList.map((s: any) => ({
                schedule_id: s.schedule_id ?? s.id,
                user_id: s.user_id ?? s.userId ?? s.user?.user_id,
                employee_name: s.employee_name ?? s.employeeName ?? s.user?.full_name ?? s.user?.name ?? '',
                schedule_date: s.schedule_date ?? s.date ?? s.scheduleDate,
                start_time: s.start_time ?? s.startTime,
                end_time: s.end_time ?? s.endTime,
                shift_type: s.shift_type ?? s.shiftType ?? 'Day',
                comments: s.comments ?? s.note ?? '',
                status: s.status ?? 'Draft',
                approved_by: s.approved_by ?? s.approvedBy,
                approval_date: s.approval_date ?? s.approvalDate,
              }))
            );
          }
        } catch (sErr) {
          console.error('Failed to load schedules:', sErr);
          if (mounted) setError('Failed to load schedules from API.');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();

    return () => {
      mounted = false;
    };
  }, [selectedWeek]);

  function getCurrentWeek() {
    const today = new Date();
    // get Monday of current week (if Sunday -> previous Monday)
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(today.setDate(diff));
    return monday.toISOString().split('T')[0];
  }

  const getStatusBadge = (status: string) => {
    const statusStyles = {
      Draft: 'bg-yellow-100 text-yellow-800',
      Approved: 'bg-green-100 text-green-800',
      Locked: 'bg-gray-100 text-gray-800',
    };
    return statusStyles[status as keyof typeof statusStyles] || 'bg-gray-100 text-gray-800';
  };

  const handleCreateSchedule = () => {
    setIsCreateOpen(true);
  };

  const handleEditSchedule = (schedule: EmployeeSchedule) => {
    setSelectedSchedule(schedule);
    setIsEditOpen(true);
  };

  // Create schedule via API and update local state
  const createSchedule = async (data: any) => {
    setLoading(true);
    setError(null);
    try {
      const payload = {
        ...data,
        user_id: Number(data.user_id),
      };
      const created: any = await apiClient.post('/schedules', payload);
      // normalize created item if necessary
      const item: EmployeeSchedule = {
        schedule_id: created.schedule_id ?? created.id,
        user_id: created.user_id ?? created.userId,
        employee_name: created.employee_name ?? created.employeeName ?? created.user?.full_name ?? '',
        schedule_date: created.schedule_date ?? created.date,
        start_time: created.start_time ?? created.startTime,
        end_time: created.end_time ?? created.endTime,
        shift_type: created.shift_type ?? created.shiftType ?? 'Day',
        comments: created.comments ?? created.note ?? '',
        status: created.status ?? 'Draft',
        approved_by: created.approved_by ?? created.approvedBy,
        approval_date: created.approval_date ?? created.approvalDate,
      };
      setSchedules((prev) => [item, ...prev]);
      setIsCreateOpen(false);
    } catch (err) {
      console.error('Create schedule failed:', err);
      setError('Failed to create schedule.');
    } finally {
      setLoading(false);
    }
  };

  // Update schedule via API and update local state
  const updateSchedule = async (id: number, data: any) => {
    setLoading(true);
    setError(null);
    try {
      const payload = { ...data, user_id: Number(data.user_id) };
      const updated: any = await apiClient.put(`/schedules/${id}`, payload);
      const item: EmployeeSchedule = {
        schedule_id: updated.schedule_id ?? updated.id ?? id,
        user_id: updated.user_id ?? updated.userId ?? Number(payload.user_id),
        employee_name: updated.employee_name ?? updated.employeeName ?? '',
        schedule_date: updated.schedule_date ?? updated.date ?? payload.schedule_date,
        start_time: updated.start_time ?? updated.startTime ?? payload.start_time,
        end_time: updated.end_time ?? updated.endTime ?? payload.end_time,
        shift_type: updated.shift_type ?? updated.shiftType ?? payload.shift_type,
        comments: updated.comments ?? updated.note ?? payload.comments,
        status: updated.status ?? 'Draft',
        approved_by: updated.approved_by ?? updated.approvedBy,
        approval_date: updated.approval_date ?? updated.approvalDate,
      };
      setSchedules((prev) => prev.map((s) => (s.schedule_id === item.schedule_id ? item : s)));
      setIsEditOpen(false);
      setSelectedSchedule(null);
    } catch (err) {
      console.error('Update schedule failed:', err);
      setError('Failed to update schedule.');
    } finally {
      setLoading(false);
    }
  };

  // Delete schedule via API and update local state
  const deleteSchedule = async (id: number) => {
    if (!confirm('Are you sure you want to delete this schedule?')) return;
    setLoading(true);
    setError(null);
    try {
      await apiClient.delete(`/schedules/${id}`);
      setSchedules((prev) => prev.filter((s) => s.schedule_id !== id));
    } catch (err) {
      console.error('Delete schedule failed:', err);
      setError('Failed to delete schedule.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center space-x-2">
              <Calendar className="h-5 w-5" />
              <span>Employee Schedule Management</span>
            </CardTitle>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Label htmlFor="week-select">Week Starting:</Label>
                <Input
                  id="week-select"
                  type="date"
                  value={selectedWeek}
                  onChange={(e) => setSelectedWeek(e.target.value)}
                  className="w-40"
                />
              </div>
              <Button onClick={handleCreateSchedule}>
                <Plus className="h-4 w-4 mr-2" />
                Create Schedule
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Error / Loading */}
      {error && (
        <Card>
          <CardContent>
            <div className="text-sm text-red-600">{error}</div>
          </CardContent>
        </Card>
      )}

      {/* Schedule Table */}
      <Card>
        <CardHeader>
          <CardTitle>Weekly Schedule Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Shift Time</TableHead>
                  <TableHead>Shift Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Approved By</TableHead>
                  <TableHead>Comments</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedules.map((schedule) => (
                  <TableRow key={schedule.schedule_id}>
                    <TableCell className="font-medium">{schedule.employee_name}</TableCell>
                    <TableCell>{formatDate(schedule.schedule_date)}</TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-1">
                        <Clock className="h-4 w-4 text-gray-400" />
                        <span>
                          {schedule.start_time} - {schedule.end_time}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{schedule.shift_type}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusBadge(schedule.status)}>{schedule.status}</Badge>
                    </TableCell>
                    <TableCell>{schedule.approved_by || '-'}</TableCell>
                    <TableCell>
                      <div className="max-w-xs truncate">{schedule.comments || '-'}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-1">
                        <Button variant="ghost" size="sm" onClick={() => handleEditSchedule(schedule)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-800"
                          onClick={() => deleteSchedule(schedule.schedule_id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {schedules.length === 0 && !loading && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-sm text-muted-foreground">
                      No schedules found for the selected week.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Create Schedule Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Employee Schedule</DialogTitle>
          </DialogHeader>
          <ScheduleForm
            users={users}
            onClose={() => setIsCreateOpen(false)}
            onSubmit={async (data) => {
              await createSchedule(data);
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Schedule Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Employee Schedule</DialogTitle>
          </DialogHeader>
          {selectedSchedule && (
            <ScheduleForm
              users={users}
              schedule={selectedSchedule}
              onClose={() => {
                setIsEditOpen(false);
                setSelectedSchedule(null);
              }}
              onSubmit={async (data) => {
                if (!selectedSchedule) return;
                await updateSchedule(selectedSchedule.schedule_id, data);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Schedule Form Component
interface ScheduleFormProps {
  users: User[];
  schedule?: EmployeeSchedule;
  onClose: () => void;
  onSubmit: (data: any) => void;
}

const ScheduleForm: React.FC<ScheduleFormProps> = ({ users, schedule, onClose, onSubmit }) => {
  const [formData, setFormData] = useState({
    user_id: schedule?.user_id?.toString() || '',
    schedule_date: schedule?.schedule_date || '',
    start_time: schedule?.start_time || '',
    end_time: schedule?.end_time || '',
    shift_type: schedule?.shift_type || '',
    comments: schedule?.comments || '',
  });

  useEffect(() => {
    // keep form in sync when schedule prop changes (e.g., on edit open)
    setFormData({
      user_id: schedule?.user_id?.toString() || '',
      schedule_date: schedule?.schedule_date || '',
      start_time: schedule?.start_time || '',
      end_time: schedule?.end_time || '',
      shift_type: schedule?.shift_type || '',
      comments: schedule?.comments || '',
    });
  }, [schedule]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="employee">Employee *</Label>
          <Select value={formData.user_id} onValueChange={(value) => setFormData((prev) => ({ ...prev, user_id: value }))}>
            <SelectTrigger>
              <SelectValue placeholder="Select employee" />
            </SelectTrigger>
            <SelectContent>
              {users.map((user) => (
                <SelectItem key={user.user_id} value={user.user_id.toString()}>
                  {user.full_name} ({user.role})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="schedule_date">Schedule Date *</Label>
          <Input
            id="schedule_date"
            type="date"
            value={formData.schedule_date}
            onChange={(e) => setFormData((prev) => ({ ...prev, schedule_date: e.target.value }))}
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label htmlFor="start_time">Start Time *</Label>
          <Input
            id="start_time"
            type="time"
            value={formData.start_time}
            onChange={(e) => setFormData((prev) => ({ ...prev, start_time: e.target.value }))}
            required
          />
        </div>

        <div>
          <Label htmlFor="end_time">End Time *</Label>
          <Input
            id="end_time"
            type="time"
            value={formData.end_time}
            onChange={(e) => setFormData((prev) => ({ ...prev, end_time: e.target.value }))}
            required
          />
        </div>

        <div>
          <Label htmlFor="shift_type">Shift Type</Label>
          <Select value={formData.shift_type} onValueChange={(value) => setFormData((prev) => ({ ...prev, shift_type: value }))}>
            <SelectTrigger>
              <SelectValue placeholder="Select shift type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Day">Day Shift</SelectItem>
              <SelectItem value="Night">Night Shift</SelectItem>
              <SelectItem value="On-call">On-call</SelectItem>
              <SelectItem value="Overtime">Overtime</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor="comments">Comments</Label>
        <Textarea
          id="comments"
          value={formData.comments}
          onChange={(e) => setFormData((prev) => ({ ...prev, comments: e.target.value }))}
          rows={3}
          placeholder="Add any additional notes or comments"
        />
      </div>

      <div className="flex justify-end space-x-2 pt-4">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit">{schedule ? 'Update Schedule' : 'Create Schedule'}</Button>
      </div>
    </form>
  );
};

export default EmployeeScheduleManagement;