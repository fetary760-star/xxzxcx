import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTimezone } from '@/lib/timezone-context';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ArrowRightLeft, Search, Plus, Eye, CheckCircle, XCircle, Clock } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface TaskTransfer {
  transfer_id: number;
  task_id: number;
  task_serial_number: string;
  from_engineer: string;
  to_engineer: string;
  transfer_reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  requested_by: string;
  requested_at: string;
  approved_by?: string;
  approved_at?: string;
}

const TaskTransferManagement = () => {
  const { formatDate } = useTimezone();
  const [transfers, setTransfers] = useState<TaskTransfer[]>([
    {
      transfer_id: 1,
      task_id: 101,
      task_serial_number: 'TC-101',
      from_engineer: 'John Doe',
      to_engineer: 'Jane Smith',
      transfer_reason: 'Workload balancing',
      status: 'Pending',
      requested_by: 'Team Leader',
      requested_at: '2024-01-15T10:30:00Z'
    },
    {
      transfer_id: 2,
      task_id: 102,
      task_serial_number: 'TC-102',
      from_engineer: 'Mike Johnson',
      to_engineer: 'John Doe',
      transfer_reason: 'Specialized expertise required',
      status: 'Approved',
      requested_by: 'Director',
      requested_at: '2024-01-14T14:20:00Z',
      approved_by: 'Director',
      approved_at: '2024-01-14T15:00:00Z'
    },
    {
      transfer_id: 3,
      task_id: 103,
      task_serial_number: 'TC-103',
      from_engineer: 'Jane Smith',
      to_engineer: 'Mike Johnson',
      transfer_reason: 'Engineer on leave',
      status: 'Rejected',
      requested_by: 'Team Leader',
      requested_at: '2024-01-13T09:15:00Z',
      approved_by: 'Director',
      approved_at: '2024-01-13T11:30:00Z'
    }
  ]);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isCreateTransferOpen, setIsCreateTransferOpen] = useState(false);

  // Status badge styling
  const getStatusBadge = (status: string) => {
    const statusStyles = {
      'Pending': 'bg-yellow-100 text-yellow-800',
      'Approved': 'bg-green-100 text-green-800',
      'Rejected': 'bg-red-100 text-red-800'
    };
    return statusStyles[status as keyof typeof statusStyles] || 'bg-gray-100 text-gray-800';
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Approved':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'Rejected':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'Pending':
        return <Clock className="h-4 w-4 text-yellow-600" />;
      default:
        return null;
    }
  };

  // Filter transfers
  const filteredTransfers = transfers.filter(transfer => {
    const matchesSearch = 
      transfer.task_serial_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      transfer.from_engineer.toLowerCase().includes(searchQuery.toLowerCase()) ||
      transfer.to_engineer.toLowerCase().includes(searchQuery.toLowerCase()) ||
      transfer.transfer_reason.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || transfer.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const handleApproveTransfer = (transferId: number) => {
    setTransfers(prev => prev.map(transfer => 
      transfer.transfer_id === transferId 
        ? { 
            ...transfer, 
            status: 'Approved' as const,
            approved_by: 'Current User',
            approved_at: new Date().toISOString()
          }
        : transfer
    ));
  };

  const handleRejectTransfer = (transferId: number) => {
    setTransfers(prev => prev.map(transfer => 
      transfer.transfer_id === transferId 
        ? { 
            ...transfer, 
            status: 'Rejected' as const,
            approved_by: 'Current User',
            approved_at: new Date().toISOString()
          }
        : transfer
    ));
  };

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <ArrowRightLeft className="h-5 w-5" />
            <span>Task Transfer Management</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertDescription>
              Manage task transfers between engineers. Pending transfers require approval from authorized personnel.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Search and Filter */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by Task ID, Engineer, or Reason"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="Pending">Pending</SelectItem>
                <SelectItem value="Approved">Approved</SelectItem>
                <SelectItem value="Rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
            
            <Dialog open={isCreateTransferOpen} onOpenChange={setIsCreateTransferOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Request Transfer
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Request Task Transfer</DialogTitle>
                </DialogHeader>
                <CreateTransferForm onClose={() => setIsCreateTransferOpen(false)} />
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>

      {/* Transfers Table */}
      <Card>
        <CardHeader>
          <CardTitle>Transfer Requests</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Transfer ID</TableHead>
                  <TableHead>Task ID</TableHead>
                  <TableHead>From Engineer</TableHead>
                  <TableHead>To Engineer</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Requested By</TableHead>
                  <TableHead>Requested Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTransfers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-gray-500">
                      No transfer requests found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTransfers.map((transfer) => (
                    <TableRow key={transfer.transfer_id}>
                      <TableCell className="font-medium">
                        TR-{transfer.transfer_id}
                      </TableCell>
                      <TableCell>{transfer.task_serial_number}</TableCell>
                      <TableCell>{transfer.from_engineer}</TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <ArrowRightLeft className="h-4 w-4 text-gray-400" />
                          <span>{transfer.to_engineer}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="max-w-xs truncate">
                          {transfer.transfer_reason}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          {getStatusIcon(transfer.status)}
                          <Badge className={getStatusBadge(transfer.status)}>
                            {transfer.status}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>{transfer.requested_by}</TableCell>
                      <TableCell>
                        {formatDate(transfer.requested_at)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-1">
                          <Button variant="ghost" size="sm">
                            <Eye className="h-4 w-4" />
                          </Button>
                          {transfer.status === 'Pending' && (
                            <>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => handleApproveTransfer(transfer.transfer_id)}
                                className="text-green-600 hover:text-green-800"
                              >
                                <CheckCircle className="h-4 w-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => handleRejectTransfer(transfer.transfer_id)}
                                className="text-red-600 hover:text-red-800"
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </>
                          )}
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

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Pending Transfers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {transfers.filter(t => t.status === 'Pending').length}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Approved Transfers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {transfers.filter(t => t.status === 'Approved').length}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Rejected Transfers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {transfers.filter(t => t.status === 'Rejected').length}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

// Create Transfer Form Component
const CreateTransferForm = ({ onClose }: { onClose: () => void }) => {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Task ID</label>
        <Input placeholder="Enter task ID (e.g., TC-101)" />
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">From Engineer</label>
          <Select>
            <SelectTrigger>
              <SelectValue placeholder="Select engineer" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="john">John Doe</SelectItem>
              <SelectItem value="jane">Jane Smith</SelectItem>
              <SelectItem value="mike">Mike Johnson</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">To Engineer</label>
          <Select>
            <SelectTrigger>
              <SelectValue placeholder="Select engineer" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="john">John Doe</SelectItem>
              <SelectItem value="jane">Jane Smith</SelectItem>
              <SelectItem value="mike">Mike Johnson</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      
      <div>
        <label className="block text-sm font-medium mb-1">Transfer Reason</label>
        <textarea 
          className="w-full p-2 border rounded-md" 
          rows={3} 
          placeholder="Explain the reason for this transfer request"
        />
      </div>
      
      <div className="flex justify-end space-x-2 pt-4">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={onClose}>Submit Request</Button>
      </div>
    </div>
  );
};

export default TaskTransferManagement;