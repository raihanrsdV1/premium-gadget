import React from 'react';
import { useSelector } from 'react-redux';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { DollarSign, Users, ShoppingCart, Activity, Wrench, Package } from 'lucide-react';

// Super admin sees global stats
const SUPER_ADMIN_STATS = [
  { title: 'Total Revenue',   value: '৳14,52,000', change: '+20.1% from last month', icon: DollarSign, color: 'text-green-600', bg: 'bg-green-50' },
  { title: 'Total Customers', value: '2,350',       change: '+180 new this week',    icon: Users,       color: 'text-blue-600',  bg: 'bg-blue-50'  },
  { title: 'Total Orders',    value: '1,243',       change: '+19% from last month',  icon: ShoppingCart,color: 'text-purple-600',bg: 'bg-purple-50'},
  { title: 'Active Repairs',  value: '42',          change: '+7 since yesterday',    icon: Wrench,      color: 'text-orange-600',bg: 'bg-orange-50'},
];

// Branch admin sees branch-scoped stats
const BRANCH_ADMIN_STATS = [
  { title: 'Branch Orders',        value: '87',    change: '+5 today',             icon: ShoppingCart, color: 'text-purple-600', bg: 'bg-purple-50' },
  { title: 'Active Repairs',       value: '14',    change: '3 ready for pickup',   icon: Wrench,       color: 'text-orange-600', bg: 'bg-orange-50' },
  { title: 'Branch Revenue',       value: '৳3,20,000', change: 'This month',      icon: DollarSign,   color: 'text-green-600',  bg: 'bg-green-50'  },
  { title: 'Low Stock Items',      value: '6',     change: 'Needs restocking',     icon: Package,      color: 'text-red-600',    bg: 'bg-red-50'    },
];

const RECENT_ORDERS = [
  { id: '#ORD-9871', customer: 'Rahim Ali',     status: 'Delivered',  statusCls: 'bg-green-100 text-green-700',  amount: '৳1,25,000' },
  { id: '#ORD-9872', customer: 'Sadia Rahman',  status: 'Processing', statusCls: 'bg-blue-100 text-blue-700',    amount: '৳45,000'   },
  { id: '#ORD-9873', customer: 'Karim Hossain', status: 'Pending',    statusCls: 'bg-amber-100 text-amber-700',  amount: '৳2,10,000' },
];

const RECENT_REPAIRS = [
  { ticket: 'RPR-1234', device: 'MacBook Pro 14"', status: 'Repairing',      statusCls: 'bg-blue-100 text-blue-700',   tech: 'Arif H.' },
  { ticket: 'RPR-1233', device: 'Dell XPS 15',     status: 'Ready',          statusCls: 'bg-green-100 text-green-700', tech: 'Mitu S.' },
  { ticket: 'RPR-1232', device: 'Lenovo X1 Carbon',status: 'Pending Payment',statusCls: 'bg-amber-100 text-amber-700', tech: 'Arif H.' },
];

const Dashboard = () => {
  const { user } = useSelector(state => state.auth);
  const isSuperAdmin = user?.role === 'super_admin';
  const stats = isSuperAdmin ? SUPER_ADMIN_STATS : BRANCH_ADMIN_STATS;
  const firstName = user?.full_name?.split(' ')[0] || 'Admin';

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">
          Welcome back, {firstName} 👋
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          {isSuperAdmin
            ? 'Here\'s what\'s happening across all branches today.'
            : 'Here\'s your branch overview for today.'}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
              <div className={`p-2 rounded-lg ${stat.bg}`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground mt-1">{stat.change}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className={`grid gap-6 ${isSuperAdmin ? 'lg:grid-cols-2' : 'lg:grid-cols-1'}`}>
        {/* Recent Orders */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Orders</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50/50">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Order</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Customer</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {RECENT_ORDERS.map(o => (
                    <tr key={o.id} className="border-b last:border-0 hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 font-mono font-medium">{o.id}</td>
                      <td className="px-4 py-3">{o.customer}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${o.statusCls}`}>{o.status}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium">{o.amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Recent Repairs — shown to both, but super admin also sees orders side by side */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Repairs</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50/50">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Ticket</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Device</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Tech</th>
                  </tr>
                </thead>
                <tbody>
                  {RECENT_REPAIRS.map(r => (
                    <tr key={r.ticket} className="border-b last:border-0 hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 font-mono font-medium">{r.ticket}</td>
                      <td className="px-4 py-3">{r.device}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${r.statusCls}`}>{r.status}</span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{r.tech}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Super admin only: branch summary */}
      {isSuperAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Branch Performance</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50/50">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Branch</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Orders</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Repairs</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 font-medium">Dhaka Main</td>
                    <td className="px-4 py-3 text-right">87</td>
                    <td className="px-4 py-3 text-right">24</td>
                    <td className="px-4 py-3 text-right">৳9,20,000</td>
                  </tr>
                  <tr className="border-b hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 font-medium">Chittagong Branch</td>
                    <td className="px-4 py-3 text-right">54</td>
                    <td className="px-4 py-3 text-right">18</td>
                    <td className="px-4 py-3 text-right">৳5,32,000</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Dashboard;
