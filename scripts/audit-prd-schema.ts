import { Client } from 'pg';
import 'dotenv/config';

type ExpectedColumn = {
  dataType: string;
  allowNull?: boolean;
  udtName?: string;
};

type ExpectedTable = Record<string, ExpectedColumn>;

type ExpectedEnums = Record<string, string[]>;

const expectedEnums: ExpectedEnums = {
  role: ['ADMIN', 'MANAGER', 'CASHIER'],
  sale_status: ['COMPLETED', 'RETURNED'],
  subscription_provider: ['PAYSTACK', 'FLW'],
  subscription_status: ['ACTIVE', 'PAST_DUE', 'CANCELLED'],
};

const expectedTables: Record<string, ExpectedTable> = {
  organizations: {
    id: { dataType: 'uuid', allowNull: false },
    name: { dataType: 'character varying', allowNull: false },
    currency: { dataType: 'character varying', allowNull: false },
    is_active: { dataType: 'boolean', allowNull: false },
    locked_until: { dataType: 'timestamp with time zone', allowNull: true },
    billing_email: { dataType: 'character varying', allowNull: true },
    created_at: { dataType: 'timestamp with time zone', allowNull: true },
  },
  stores: {
    id: { dataType: 'uuid', allowNull: false },
    org_id: { dataType: 'uuid', allowNull: false },
    name: { dataType: 'character varying', allowNull: false },
    address: { dataType: 'text', allowNull: true },
    currency: { dataType: 'character varying', allowNull: true },
    created_at: { dataType: 'timestamp with time zone', allowNull: true },
  },
  users: {
    id: { dataType: 'uuid', allowNull: false },
    org_id: { dataType: 'uuid', allowNull: true },
    email: { dataType: 'character varying', allowNull: false },
    password_hash: { dataType: 'character varying', allowNull: false },
    settings: { dataType: 'jsonb', allowNull: true },
    is_admin: { dataType: 'boolean', allowNull: false },
    requires_2fa: { dataType: 'boolean', allowNull: false },
    totp_secret: { dataType: 'character varying', allowNull: true },
    created_at: { dataType: 'timestamp with time zone', allowNull: true },
    last_login_at: { dataType: 'timestamp with time zone', allowNull: true },
    email_verified: { dataType: 'boolean', allowNull: true },
    requires_password_change: { dataType: 'boolean', allowNull: true },
  },
  user_roles: {
    id: { dataType: 'uuid', allowNull: false },
    user_id: { dataType: 'uuid', allowNull: false },
    org_id: { dataType: 'uuid', allowNull: false },
    store_id: { dataType: 'uuid', allowNull: true },
    role: { dataType: 'USER-DEFINED', udtName: 'role', allowNull: false },
  },
  ip_whitelist: {
    id: { dataType: 'uuid', allowNull: false },
    org_id: { dataType: 'uuid', allowNull: false },
    role: { dataType: 'USER-DEFINED', udtName: 'role', allowNull: false },
    cidr_or_ip: { dataType: 'character varying', allowNull: false },
    label: { dataType: 'character varying', allowNull: true },
    created_at: { dataType: 'timestamp with time zone', allowNull: true },
  },
  customers: {
    id: { dataType: 'uuid', allowNull: false },
    org_id: { dataType: 'uuid', allowNull: false },
    phone: { dataType: 'character varying', allowNull: false },
    name: { dataType: 'character varying', allowNull: true },
    created_at: { dataType: 'timestamp with time zone', allowNull: true },
  },
  loyalty_accounts: {
    id: { dataType: 'uuid', allowNull: false },
    org_id: { dataType: 'uuid', allowNull: false },
    customer_id: { dataType: 'uuid', allowNull: false },
    points: { dataType: 'integer', allowNull: false },
    tier: { dataType: 'character varying', allowNull: true },
  },
  loyalty_transactions: {
    id: { dataType: 'uuid', allowNull: false },
    loyalty_account_id: { dataType: 'uuid', allowNull: false },
    points: { dataType: 'integer', allowNull: false },
    reason: { dataType: 'character varying', allowNull: false },
    created_at: { dataType: 'timestamp with time zone', allowNull: true },
  },
  products: {
    id: { dataType: 'uuid', allowNull: false },
    org_id: { dataType: 'uuid', allowNull: false },
    sku: { dataType: 'character varying', allowNull: false },
    barcode: { dataType: 'character varying', allowNull: true },
    name: { dataType: 'character varying', allowNull: false },
    cost_price: { dataType: 'numeric', allowNull: false },
    sale_price: { dataType: 'numeric', allowNull: false },
    vat_rate: { dataType: 'numeric', allowNull: false },
    created_at: { dataType: 'timestamp with time zone', allowNull: true },
  },
  inventory: {
    id: { dataType: 'uuid', allowNull: false },
    store_id: { dataType: 'uuid', allowNull: false },
    product_id: { dataType: 'uuid', allowNull: false },
    quantity: { dataType: 'integer', allowNull: false },
    reorder_level: { dataType: 'integer', allowNull: false },
  },
  sales: {
    id: { dataType: 'uuid', allowNull: false },
    org_id: { dataType: 'uuid', allowNull: false },
    store_id: { dataType: 'uuid', allowNull: false },
    cashier_id: { dataType: 'uuid', allowNull: false },
    subtotal: { dataType: 'numeric', allowNull: false },
    discount: { dataType: 'numeric', allowNull: false },
    tax: { dataType: 'numeric', allowNull: false },
    total: { dataType: 'numeric', allowNull: false },
    payment_method: { dataType: 'text', allowNull: false },
    status: { dataType: 'USER-DEFINED', udtName: 'sale_status', allowNull: false },
    occurred_at: { dataType: 'timestamp with time zone', allowNull: false },
    idempotency_key: { dataType: 'character varying', allowNull: false },
  },
  sale_items: {
    id: { dataType: 'uuid', allowNull: false },
    sale_id: { dataType: 'uuid', allowNull: false },
    product_id: { dataType: 'uuid', allowNull: false },
    quantity: { dataType: 'integer', allowNull: false },
    unit_price: { dataType: 'numeric', allowNull: false },
    line_discount: { dataType: 'numeric', allowNull: false },
    line_total: { dataType: 'numeric', allowNull: false },
  },
  returns: {
    id: { dataType: 'uuid', allowNull: false },
    sale_id: { dataType: 'uuid', allowNull: false },
    reason: { dataType: 'text', allowNull: true },
    processed_by: { dataType: 'uuid', allowNull: false },
    occurred_at: { dataType: 'timestamp with time zone', allowNull: true },
  },
  price_changes: {
    id: { dataType: 'uuid', allowNull: false },
    org_id: { dataType: 'uuid', allowNull: false },
    store_id: { dataType: 'uuid', allowNull: true },
    product_id: { dataType: 'uuid', allowNull: true },
    old_price: { dataType: 'numeric', allowNull: false },
    new_price: { dataType: 'numeric', allowNull: false },
    initiated_by: { dataType: 'uuid', allowNull: false },
    created_at: { dataType: 'timestamp with time zone', allowNull: true },
  },
  stock_alerts: {
    id: { dataType: 'uuid', allowNull: false },
    store_id: { dataType: 'uuid', allowNull: false },
    product_id: { dataType: 'uuid', allowNull: false },
    current_qty: { dataType: 'integer', allowNull: false },
    reorder_level: { dataType: 'integer', allowNull: false },
    created_at: { dataType: 'timestamp with time zone', allowNull: true },
    resolved: { dataType: 'boolean', allowNull: false },
  },
  subscriptions: {
    id: { dataType: 'uuid', allowNull: false },
    org_id: { dataType: 'uuid', allowNull: false },
    provider: { dataType: 'USER-DEFINED', udtName: 'subscription_provider', allowNull: false },
    plan_code: { dataType: 'character varying', allowNull: false },
    status: { dataType: 'USER-DEFINED', udtName: 'subscription_status', allowNull: false },
    external_customer_id: { dataType: 'character varying', allowNull: true },
    external_sub_id: { dataType: 'character varying', allowNull: true },
    started_at: { dataType: 'timestamp with time zone', allowNull: true },
    current_period_end: { dataType: 'timestamp with time zone', allowNull: true },
    last_event_raw: { dataType: 'jsonb', allowNull: true },
    updated_at: { dataType: 'timestamp with time zone', allowNull: true },
  },
  subscription_payments: {
    id: { dataType: 'uuid', allowNull: false },
    org_id: { dataType: 'uuid', allowNull: false },
    provider: { dataType: 'USER-DEFINED', udtName: 'subscription_provider', allowNull: false },
    plan_code: { dataType: 'character varying', allowNull: false },
    external_sub_id: { dataType: 'character varying', allowNull: true },
    external_invoice_id: { dataType: 'character varying', allowNull: true },
    reference: { dataType: 'character varying', allowNull: true },
    amount: { dataType: 'numeric', allowNull: false },
    currency: { dataType: 'character varying', allowNull: false },
    status: { dataType: 'character varying', allowNull: false },
    event_type: { dataType: 'character varying', allowNull: true },
    occurred_at: { dataType: 'timestamp with time zone', allowNull: true },
    raw: { dataType: 'jsonb', allowNull: true },
  },
  webhook_events: {
    id: { dataType: 'uuid', allowNull: false },
    provider: { dataType: 'USER-DEFINED', udtName: 'subscription_provider', allowNull: false },
    event_id: { dataType: 'character varying', allowNull: false },
    received_at: { dataType: 'timestamp with time zone', allowNull: true },
  },
  dunning_events: {
    id: { dataType: 'uuid', allowNull: false },
    org_id: { dataType: 'uuid', allowNull: false },
    subscription_id: { dataType: 'uuid', allowNull: false },
    attempt: { dataType: 'integer', allowNull: false },
    status: { dataType: 'character varying', allowNull: false },
    reason: { dataType: 'text', allowNull: true },
    sent_at: { dataType: 'timestamp with time zone', allowNull: true },
    next_attempt_at: { dataType: 'timestamp with time zone', allowNull: true },
  },
  audit_logs: {
    id: { dataType: 'uuid', allowNull: false },
    org_id: { dataType: 'uuid', allowNull: false },
    user_id: { dataType: 'uuid', allowNull: true },
    action: { dataType: 'character varying', allowNull: false },
    entity: { dataType: 'character varying', allowNull: false },
    entity_id: { dataType: 'uuid', allowNull: true },
    meta: { dataType: 'jsonb', allowNull: true },
    ip: { dataType: 'character varying', allowNull: true },
    user_agent: { dataType: 'text', allowNull: true },
    created_at: { dataType: 'timestamp with time zone', allowNull: true },
  },
};

interface ColumnInfo {
  table: string;
  column: string;
  dataType: string;
  udtName: string;
  isNullable: boolean;
}

interface AuditResult {
  missingTables: string[];
  missingColumns: Array<{ table: string; column: string }>;
  mismatchedColumns: Array<{
    table: string;
    column: string;
    expected: string;
    actual: string;
  }>;
  missingEnums: string[];
  enumMismatches: Array<{ name: string; expected: string[]; actual: string[] }>; 
}

function normalizeType(column: ColumnInfo): string {
  if (column.dataType === 'USER-DEFINED') {
    return `${column.dataType}:${column.udtName}`;
  }
  return column.dataType;
}

function expectedType(column: ExpectedColumn): string {
  if (column.dataType === 'USER-DEFINED') {
    return `${column.dataType}:${column.udtName}`;
  }
  return column.dataType;
}

async function main() {
  const cliArg = process.argv[2];
  const connectionString = cliArg || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('Provide DATABASE_URL via env or first CLI argument');
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    const tablesRes = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
    );
    const existingTables = new Set(tablesRes.rows.map((row) => row.table_name));

    const columnsRes = await client.query<{
      table_name: string;
      column_name: string;
      data_type: string;
      udt_name: string;
      is_nullable: string;
    }>(
      `SELECT table_name, column_name, data_type, udt_name, is_nullable
       FROM information_schema.columns
       WHERE table_schema = 'public'`
    );

    const columnMap = new Map<string, ColumnInfo>();
    for (const row of columnsRes.rows) {
      const key = `${row.table_name}.${row.column_name}`;
      columnMap.set(key, {
        table: row.table_name,
        column: row.column_name,
        dataType: row.data_type,
        udtName: row.udt_name,
        isNullable: row.is_nullable === 'YES',
      });
    }

    const result: AuditResult = {
      missingTables: [],
      missingColumns: [],
      mismatchedColumns: [],
      missingEnums: [],
      enumMismatches: [],
    };

    for (const tableName of Object.keys(expectedTables)) {
      if (!existingTables.has(tableName)) {
        result.missingTables.push(tableName);
        continue;
      }

      const expectedColumns = expectedTables[tableName];
      for (const [columnName, columnDef] of Object.entries(expectedColumns)) {
        const key = `${tableName}.${columnName}`;
        const actual = columnMap.get(key);
        if (!actual) {
          result.missingColumns.push({ table: tableName, column: columnName });
          continue;
        }

        const actualType = normalizeType(actual);
        const expected = expectedType(columnDef);
        if (actualType !== expected) {
          result.mismatchedColumns.push({
            table: tableName,
            column: columnName,
            expected,
            actual: actualType,
          });
        }
      }
    }

    const enumRes = await client.query<{
      typname: string;
      enumlabel: string;
    }>(
      `SELECT t.typname, e.enumlabel
       FROM pg_type t
       JOIN pg_enum e ON t.oid = e.enumtypid
       JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = 'public'`
    );

    const actualEnums = new Map<string, string[]>();
    for (const row of enumRes.rows) {
      if (!actualEnums.has(row.typname)) {
        actualEnums.set(row.typname, []);
      }
      actualEnums.get(row.typname)!.push(row.enumlabel);
    }

    for (const [enumName, values] of Object.entries(expectedEnums)) {
      if (!actualEnums.has(enumName)) {
        result.missingEnums.push(enumName);
        continue;
      }
      const actualValues = actualEnums.get(enumName)!.sort();
      const expectedValues = [...values].sort();
      if (actualValues.length !== expectedValues.length || actualValues.some((v, i) => v !== expectedValues[i])) {
        result.enumMismatches.push({ name: enumName, expected: expectedValues, actual: actualValues });
      }
    }

    console.log(JSON.stringify(result, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Schema audit failed:', err.message);
  process.exit(1);
});
