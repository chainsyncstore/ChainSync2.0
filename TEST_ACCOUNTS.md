# ChainSync Test Accounts

## 🎯 Test User Accounts

All test accounts are now available for testing the ChainSync POS system. Use these credentials to log in and test different user roles and permissions.

### 👑 Admin Account
- **Username:** `admin`
- **Password:** `admin123`
- **Email:** admin@chainsync.com
- **Role:** Administrator
- **Permissions:** Full system access, can manage all stores, users, and settings

### 👔 Manager Account
- **Username:** `manager`
- **Password:** `manager123`
- **Email:** manager@chainsync.com
- **Role:** Store Manager
- **Permissions:** Manage assigned store, view reports, manage inventory

### 💼 Cashier Account
- **Username:** `cashier`
- **Password:** `cashier123`
- **Email:** cashier@chainsync.com
- **Role:** Cashier
- **Permissions:** Process transactions, view inventory, basic reporting

## 🚀 How to Access

1. **Open your browser** and go to: http://localhost:5000
2. **Click "Login"** or navigate to the login page
3. **Enter credentials** from any of the accounts above
4. **Start testing** the different features based on your role

## 🔍 Role-Based Features

### Admin Features
- ✅ User management (create, edit, delete users)
- ✅ Store management (add, edit, remove stores)
- ✅ System settings and configuration
- ✅ View analytics across all stores
- ✅ Access to all POS features

### Manager Features
- ✅ Inventory management for assigned store
- ✅ Sales reports and analytics
- ✅ Staff management (for assigned store)
- ✅ POS operations
- ✅ Low stock alerts and management

### Cashier Features
- ✅ POS transactions (sales, returns)
- ✅ Product search and barcode scanning
- ✅ Basic inventory lookup
- ✅ Daily sales summary
- ✅ Receipt printing

## 🛠️ Testing Scenarios

### 1. Basic Login Test
- Try logging in with each account
- Verify role-based access to different sections
- Test logout functionality

### 2. POS System Test
- Use cashier account to process a sale
- Scan products or search by name
- Complete transaction with different payment methods

### 3. Inventory Management
- Use manager account to check inventory levels
- Update stock quantities
- View low stock alerts

### 4. Analytics & Reports
- Use admin/manager accounts to view sales reports
- Check daily/weekly analytics
- Export data if available

### 5. Multi-Store Testing
- Use admin account to switch between stores
- Verify store-specific data isolation

## 🔧 Troubleshooting

### Login Issues
- Ensure the application is running on http://localhost:5000
- Double-check username and password spelling
- Clear browser cache if needed

### Permission Issues
- Each role has specific access levels
- Admin can access everything
- Manager can access assigned store features
- Cashier has limited access for POS operations

### Data Issues
- Sample data includes 2 stores and 5 products
- Inventory levels are randomized for testing
- All data is stored in your Neon PostgreSQL database

## 📝 Notes

- **Passwords are simple** for testing purposes - change them in production
- **Sample data** is automatically created when you run the seed script
- **Hot reload** is enabled - changes to code will automatically refresh
- **Database** is connected to Neon PostgreSQL for persistence

Happy testing! 🎉 