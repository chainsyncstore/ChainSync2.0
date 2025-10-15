import React, { useState, useEffect } from 'react';

export default function LowStockEmailOptOutToggle() {
  const [optOut, setOptOut] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Optionally, fetch current preference from user profile API
  useEffect(() => {
    // Replace with your user profile fetch logic if available
    // Example:
    // fetch('/api/user/profile').then(...)
  }, []);

  const handleToggle = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/auth/low-stock-email-opt-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optOut: !optOut }),
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to update preference');
      setOptOut(!optOut);
      setSuccess(data.message);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ margin: '1.5rem 0' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="checkbox"
          checked={!!optOut}
          onChange={handleToggle}
          disabled={loading}
        />
        Disable low stock alert emails
      </label>
      {loading && <div style={{ color: '#888' }}>Saving...</div>}
      {error && <div style={{ color: 'red' }}>{error}</div>}
      {success && <div style={{ color: 'green' }}>{success}</div>}
    </div>
  );
}
