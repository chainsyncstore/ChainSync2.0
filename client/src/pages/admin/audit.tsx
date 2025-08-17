import { useEffect, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface AuditLog {
	id: string;
	orgId: string;
	userId?: string;
	action: string;
	entity: string;
	entityId?: string;
	ip?: string;
	userAgent?: string;
	createdAt: string;
	meta?: any;
}

export default function AdminAuditPage() {
	const [logs, setLogs] = useState<AuditLog[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let isMounted = true;
		(async () => {
			try {
				setLoading(true);
				const res = await fetch('/api/admin/audit?limit=50', { credentials: 'include' });
				if (!res.ok) throw new Error(`Failed to load audit logs (${res.status})`);
				const data = await res.json();
				if (isMounted) setLogs(data.logs || []);
			} catch (e: any) {
				if (isMounted) setError(e?.message || 'Failed to load audit logs');
			} finally {
				if (isMounted) setLoading(false);
			}
		})();
		return () => { isMounted = false };
	}, []);

	return (
		<div className="p-4 space-y-4">
			<Card>
				<CardHeader>
					<CardTitle>Recent Audit Logs</CardTitle>
				</CardHeader>
				<CardContent>
					{loading ? (
						<div className="text-sm text-gray-500">Loading…</div>
					) : error ? (
						<div className="text-sm text-red-600">{error}</div>
					) : logs.length === 0 ? (
						<div className="text-sm text-gray-500">No audit entries.</div>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>When</TableHead>
									<TableHead>User</TableHead>
									<TableHead>Action</TableHead>
									<TableHead>Entity</TableHead>
									<TableHead>IP</TableHead>
									<TableHead>Meta</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{logs.map((l) => (
									<TableRow key={l.id}>
										<TableCell className="whitespace-nowrap">{new Date(l.createdAt).toLocaleString()}</TableCell>
										<TableCell className="whitespace-nowrap">{l.userId || '—'}</TableCell>
										<TableCell className="whitespace-nowrap">{l.action}</TableCell>
										<TableCell className="whitespace-nowrap">{l.entity}{l.entityId ? `:${l.entityId.slice(0, 8)}` : ''}</TableCell>
										<TableCell className="whitespace-nowrap">{l.ip || '—'}</TableCell>
										<TableCell className="max-w-[320px] truncate">{l.meta ? JSON.stringify(l.meta) : '—'}</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
