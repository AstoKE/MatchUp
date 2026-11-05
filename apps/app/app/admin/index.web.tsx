import { AdminConsole } from '@/features/admin';

// Web only (the `.web` suffix): the console does not exist in the phone app (docs/PHASE6_PLAN.md M5, ADR-0006).
export default function Admin() {
  return <AdminConsole />;
}
