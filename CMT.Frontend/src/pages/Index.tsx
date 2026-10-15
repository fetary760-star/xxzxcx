import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Bell, Plus, Search, Settings, User, LogOut, Eye, Edit, Trash2, FileText, AlertTriangle, Users, FolderOpen, Target, BarChart3, Download, ArrowRightLeft, Calendar, Clock } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { NotificationPanel } from '@/components/NotificationPanel';
import EmployeeScheduleManagement from '@/components/EmployeeManagement/EmployeeSchedule';
import BulkActions from '@/components/TaskManagement/BulkActions';
import TaskTransferManagement from '@/components/TaskManagement/TaskTransfer';

// Types based on your PHP system
interface Task {
  task_id: number;
  serial_number: string;
  part_number: string;
  description: string;
  status: 'Pending' | 'In Progress' | 'Completed' | 'Blocked' | 'On Hold';
  assigned_engineer: string;
  priority_level_name: 'High' | 'Medium' | 'Low';
  creator_name: string;
  target_completion_date: string;
  created_at: string;
  attachment_path?: string;
  is_duplicate: boolean;
  show_revision_alert: boolean;
}

interface User {
  user_id: number;
  full_name: string;
  username: string;
  email: string;
  role: string;
  profile_picture_path?: string;
}

interface Notification {
  notification_id: number;
  message: string;
  is_read: boolean;
  created_at: string;
}

const CMTDashboard = () => {
  // State management
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('priority_desc');
  const [showCompletedTasks, setShowCompletedTasks] = useState(false);
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);
  const [isUpdateTaskOpen, setIsUpdateTaskOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [activeTab, setActiveTab] = useState('tasks');
  const [selectedTasks, setSelectedTasks] = useState<number[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

  // Mock data - replace with API calls to your PHP backend
  useEffect(() => {
    // Mock user data
    setUser({
      user_id: 1,
      full_name: 'John Doe',
      username: 'johndoe',
      email: 'john@ethiopianairlines.com',
      role: 'engineer'
    });

    // Mock tasks data
    setTasks([
      {
        task_id: 1,
        serial_number: 'SN001',
        part_number: 'PN001',
        description: 'Engine component inspection and maintenance',
        status: 'In Progress',
        assigned_engineer: 'John Doe',
        priority_level_name: 'High',
        creator_name: 'Team Leader',
        target_completion_date: '2024-01-15',
        created_at: '2024-01-10',
        is_duplicate: false,
        show_revision_alert: false
      },
      {
        task_id: 2,
        serial_number: 'SN002',
        part_number: 'PN002',
        description: 'Landing gear system check',
        status: 'Pending',
        assigned_engineer: 'Jane Smith',
        priority_level_name: 'Medium',
        creator_name: 'Director',
        target_completion_date: '2024-01-20',
        created_at: '2024-01-12',
        is_duplicate: false,
        show_revision_alert: true
      },
      {
        task_id: 3,
        serial_number: 'SN003',
        part_number: 'PN003',
        description: 'Hydraulic system maintenance',
        status: 'Completed',
        assigned_engineer: 'Mike Johnson',
        priority_level_name: 'Low',
        creator_name: 'Engineer',
        target_completion_date: '2024-01-18',
        created_at: '2024-01-08',
        is_duplicate: false,
        show_revision_alert: false
      }
    ]);

    // Mock notifications
    setNotifications([
      {
        notification_id: 1,
        message: 'New task assigned: Engine component inspection',
        is_read: false,
        created_at: '2024-01-10T10:00:00Z'
      },
      {
        notification_id: 2,
        message: 'Task TC-102 has been completed by Jane Smith',
        is_read: false,
        created_at: '2024-01-09T15:30:00Z'
      },
      {
        notification_id: 3,
        message: 'Schedule approved for next week',
        is_read: true,
        created_at: '2024-01-08T09:15:00Z'
      }
    ]);
  }, []);

  // Status badge styling
  const getStatusBadge = (status: string) => {
    const statusStyles = {
      'Pending': 'bg-yellow-100 text-yellow-800',
      'In Progress': 'bg-blue-100 text-blue-800',
      'Completed': 'bg-green-100 text-green-800',
      'Blocked': 'bg-red-100 text-red-800',
      'On Hold': 'bg-gray-100 text-gray-800'
    };
    return statusStyles[status as keyof typeof statusStyles] || 'bg-gray-100 text-gray-800';
  };

  // Priority badge styling
  const getPriorityBadge = (priority: string) => {
    const priorityStyles = {
      'High': 'bg-red-500 text-white',
      'Medium': 'bg-yellow-500 text-white',
      'Low': 'bg-green-500 text-white'
    };
    return priorityStyles[priority as keyof typeof priorityStyles] || 'bg-gray-500 text-white';
  };

  // Filter and sort tasks
  const filteredTasks = tasks.filter(task => {
    const matchesSearch = task.serial_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         task.part_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         task.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || task.status === statusFilter;
    const matchesCompleted = showCompletedTasks || task.status !== 'Completed';
    
    return matchesSearch && matchesStatus && matchesCompleted;
  });

  // Bulk actions handlers
  const handleSelectTask = (taskId: number, selected: boolean) => {
    if (selected) {
      setSelectedTasks(prev => [...prev, taskId]);
    } else {
      setSelectedTasks(prev => prev.filter(id => id !== taskId));
    }
  };

  const handleSelectAllTasks = (selected: boolean) => {
    if (selected) {
      setSelectedTasks(filteredTasks.map(task => task.task_id));
    } else {
      setSelectedTasks([]);
    }
  };

  const handleDeleteSelectedTasks = (taskIds: number[]) => {
    setTasks(prev => prev.filter(task => !taskIds.includes(task.task_id)));
    setSelectedTasks([]);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo and Title */}
            <div className="flex items-center space-x-4">
              <img 
                src="https://cdn.imgbin.com/18/13/16/imgbin-ethiopian-airlines-flight-logo-business-business-6fvk0fGfDtxUuLSkpNq6weQLi.jpg" 
                alt="Ethiopian Airlines" 
                className="h-10 w-auto"
              />
              <div>
                <h1 className="text-xl font-bold text-gray-900">Ethiopian Airlines</h1>
                <p className="text-sm text-gray-600">CMT Engineering Task Management</p>
              </div>
            </div>

            {/* Navigation and User Menu */}
            <div className="flex items-center space-x-4">
              {/* Notifications */}
              <div className="relative">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="relative"
                  onClick={() => setShowNotifications(!showNotifications)}
                >
                  <Bell className="h-5 w-5" />
                  {notifications.filter(n => !n.is_read).length > 0 && (
                    <Badge className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 text-xs">
                      {notifications.filter(n => !n.is_read).length}
                    </Badge>
                  )}
                </Button>
              </div>

              {/* Settings */}
              <Button variant="ghost" size="sm">
                <Settings className="h-5 w-5" />
              </Button>

              {/* User Profile */}
              <div className="flex items-center space-x-2">
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900">{user?.full_name}</p>
                  <p className="text-xs text-gray-600 capitalize">{user?.role}</p>
                </div>
                <Button variant="ghost" size="sm">
                  <User className="h-5 w-5" />
                </Button>
              </div>

              {/* Logout */}
              <Button variant="ghost" size="sm">
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Notification Panel */}
      <NotificationPanel 
        open={showNotifications} 
        onClose={() => setShowNotifications(false)}
      />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Performance Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Completion Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">85.5%</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Avg. Delay</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">2.3 days</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Tasks Completed</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">156</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Pending Tasks</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">23</div>
            </CardContent>
          </Card>
        </div>

        {/* Navigation Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-7">
            <TabsTrigger value="tasks">Tasks</TabsTrigger>
            <TabsTrigger value="transfers">Transfers</TabsTrigger>
            <TabsTrigger value="employees">Employees</TabsTrigger>
            <TabsTrigger value="users">Manage Users</TabsTrigger>
            <TabsTrigger value="categories">Categories</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
            <TabsTrigger value="reports">Reports</TabsTrigger>
          </TabsList>

          {/* Tasks Tab */}
          <TabsContent value="tasks" className="space-y-6">
            {/* Search and Filter Section */}
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                  <div className="flex items-center space-x-4 w-full sm:w-auto">
                    <img 
                      src="https://cdn.imgbin.com/18/13/16/imgbin-ethiopian-airlines-flight-logo-business-business-6fvk0fGfDtxUuLSkpNq6weQLi.jpg" 
                      alt="Logo" 
                      className="h-8 w-auto"
                    />
                    <img 
                      src="https://t4.ftcdn.net/jpg/05/30/79/01/360_F_530790159_TiJU0rF2IPB6PtYIuHxkMk70aVSK11qF.jpg" 
                      alt="Logo 2" 
                      className="h-6 w-auto"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search by Serial, Part Number, or Description"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  
                  <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger className="w-full sm:w-48">
                      <SelectValue placeholder="Sort By" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="priority_desc">Priority (High to Low)</SelectItem>
                      <SelectItem value="priority_asc">Priority (Low to High)</SelectItem>
                      <SelectItem value="newest">Newest First</SelectItem>
                      <SelectItem value="oldest">Oldest First</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  <Button onClick={() => setSearchQuery('')} variant="outline">
                    Clear Search
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Tasks Section */}
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                  <CardTitle>
                    {showCompletedTasks ? 'All Completed Tasks' : 'Current Active Tasks'}
                  </CardTitle>
                  
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-full sm:w-40">
                        <SelectValue placeholder="All Statuses" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        <SelectItem value="Pending">Pending</SelectItem>
                        <SelectItem value="In Progress">In Progress</SelectItem>
                        <SelectItem value="Completed">Completed</SelectItem>
                        <SelectItem value="Blocked">Blocked</SelectItem>
                        <SelectItem value="On Hold">On Hold</SelectItem>
                      </SelectContent>
                    </Select>
                    
                    <Dialog open={isCreateTaskOpen} onOpenChange={setIsCreateTaskOpen}>
                      <DialogTrigger asChild>
                        <Button>
                          <Plus className="h-4 w-4 mr-2" />
                          Create Task
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl">
                        <DialogHeader>
                          <DialogTitle>Create New Task</DialogTitle>
                        </DialogHeader>
                        <CreateTaskForm onClose={() => setIsCreateTaskOpen(false)} />
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
              </CardHeader>

              {/* Bulk Actions */}
              <BulkActions
                selectedItems={selectedTasks}
                totalItems={filteredTasks.length}
                onSelectAll={handleSelectAllTasks}
                onDeleteSelected={handleDeleteSelectedTasks}
                itemType="tasks"
              />
              
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">
                          <Checkbox
                            checked={selectedTasks.length === filteredTasks.length && filteredTasks.length > 0}
                            onCheckedChange={handleSelectAllTasks}
                          />
                        </TableHead>
                        <TableHead>Task ID</TableHead>
                        <TableHead>Part Number</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Engineer</TableHead>
                        <TableHead>Priority</TableHead>
                        <TableHead>Target Date</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTasks.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-8 text-gray-500">
                            No tasks found.
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredTasks.map((task) => (
                          <TableRow key={task.task_id} className={task.show_revision_alert ? 'bg-yellow-50' : ''}>
                            <TableCell>
                              <Checkbox
                                checked={selectedTasks.includes(task.task_id)}
                                onCheckedChange={(checked) => handleSelectTask(task.task_id, checked as boolean)}
                              />
                            </TableCell>
                            <TableCell className="font-medium">
                              <div className="flex items-center space-x-2">
                                <span>TC-{task.task_id}</span>
                                {task.show_revision_alert && (
                                  <AlertTriangle className="h-4 w-4 text-yellow-600 animate-pulse" />
                                )}
                              </div>
                            </TableCell>
                            <TableCell>{task.part_number}</TableCell>
                            <TableCell>
                              <div className="max-w-xs truncate">
                                {task.description}
                                {task.is_duplicate && (
                                  <Badge variant="destructive" className="ml-2">Duplicate!</Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge className={getStatusBadge(task.status)}>
                                {task.status}
                              </Badge>
                            </TableCell>
                            <TableCell>{task.assigned_engineer}</TableCell>
                            <TableCell>
                              <Badge className={getPriorityBadge(task.priority_level_name)}>
                                {task.priority_level_name}
                              </Badge>
                            </TableCell>
                            <TableCell>{task.target_completion_date}</TableCell>
                            <TableCell>
                              <div className="flex items-center space-x-1">
                                <Button variant="ghost" size="sm">
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => {
                                    setSelectedTask(task);
                                    setIsUpdateTaskOpen(true);
                                  }}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => handleDeleteSelectedTasks([task.task_id])}
                                  className="text-red-600 hover:text-red-800"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Task Transfers Tab */}
          <TabsContent value="transfers" className="space-y-6">
            <TaskTransferManagement />
          </TabsContent>

          {/* Employee Management Tab */}
          <TabsContent value="employees" className="space-y-6">
            <EmployeeScheduleManagement />
          </TabsContent>

          {/* Users Management Tab */}
          <TabsContent value="users" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Users className="h-5 w-5" />
                  <span>Manage Users</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-gray-500">
                  User management interface will be implemented here
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Categories Management Tab */}
          <TabsContent value="categories" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <FolderOpen className="h-5 w-5" />
                    <span>Manage Categories</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8 text-gray-500">
                    Categories management interface
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Manage Sub Types</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8 text-gray-500">
                    Sub types management interface
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Manage Request Types</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8 text-gray-500">
                    Request types management interface
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Manage Priority Levels</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8 text-gray-500">
                    Priority levels management interface
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Performance Tab */}
          <TabsContent value="performance" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <BarChart3 className="h-5 w-5" />
                    <span>Performance Dashboard</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8 text-gray-500">
                    Performance dashboard charts
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Overall Performance Trend</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8 text-gray-500">
                    Performance trend analysis
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Engineer Workload</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8 text-gray-500">
                    Engineer workload distribution
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Reports Tab */}
          <TabsContent value="reports" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Download className="h-5 w-5" />
                  <span>Export & Reports</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Button variant="outline" className="justify-start">
                    <Download className="h-4 w-4 mr-2" />
                    Export All Tasks
                  </Button>
                  <Button variant="outline" className="justify-start">
                    <Download className="h-4 w-4 mr-2" />
                    Export Performance
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Update Task Dialog */}
        <Dialog open={isUpdateTaskOpen} onOpenChange={setIsUpdateTaskOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                Update Task {selectedTask && `TC-${selectedTask.task_id}`}
              </DialogTitle>
            </DialogHeader>
            {selectedTask && (
              <UpdateTaskForm 
                task={selectedTask} 
                onClose={() => {
                  setIsUpdateTaskOpen(false);
                  setSelectedTask(null);
                }} 
              />
            )}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
};

// Create Task Form Component
const CreateTaskForm = ({ onClose }: { onClose: () => void }) => {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Serial Number</label>
          <Input placeholder="Enter serial number" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Part Number</label>
          <Input placeholder="Enter part number" />
        </div>
      </div>
      
      <div>
        <label className="block text-sm font-medium mb-1">Description</label>
        <textarea 
          className="w-full p-2 border rounded-md" 
          rows={3} 
          placeholder="Enter task description"
        />
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Priority</label>
          <Select>
            <SelectTrigger>
              <SelectValue placeholder="Select priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Assigned Engineer</label>
          <Select>
            <SelectTrigger>
              <SelectValue placeholder="Select engineer" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="john">John Doe</SelectItem>
              <SelectItem value="jane">Jane Smith</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      
      <div className="flex justify-end space-x-2 pt-4">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={onClose}>Create Task</Button>
      </div>
    </div>
  );
};

// Update Task Form Component
const UpdateTaskForm = ({ task, onClose }: { task: Task; onClose: () => void }) => {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Status</label>
        <Select defaultValue={task.status}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Pending">Pending</SelectItem>
            <SelectItem value="In Progress">In Progress</SelectItem>
            <SelectItem value="Completed">Completed</SelectItem>
            <SelectItem value="Blocked">Blocked</SelectItem>
            <SelectItem value="On Hold">On Hold</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      <div>
        <label className="block text-sm font-medium mb-1">Comments/Updates</label>
        <textarea 
          className="w-full p-2 border rounded-md" 
          rows={3} 
          placeholder="Add comments or updates"
        />
      </div>
      
      <div className="flex justify-end space-x-2 pt-4">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={onClose}>Save Changes</Button>
      </div>
    </div>
  );
};

export default CMTDashboard;