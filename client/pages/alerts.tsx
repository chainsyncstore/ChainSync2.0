import React from 'react';
import LowStockEmailOptOutToggle from '../components/LowStockEmailOptOutToggle';

export default function AlertsPage() {
  return (
    <div style={{ maxWidth: 600, margin: '2rem auto', padding: 24 }}>
      <h1>Alerts & Notifications</h1>
      <p>Manage your alert preferences below.</p>
      <section style={{ margin: '2rem 0' }}>
        <h2>Low Stock Email Alerts</h2>
        <LowStockEmailOptOutToggle />
      </section>
      {/* ...other alert settings/components can go here... */}
    </div>
  );
}
