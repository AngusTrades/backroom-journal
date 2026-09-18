import { requireUser } from "@/lib/auth";
import { Sidebar } from "@/components/Sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="flex min-h-screen">
      <Sidebar userName={user.name} isAdmin={user.role === "admin"} />
      <main className="min-w-0 flex-1 overflow-auto p-[26px] pb-[30px] pl-[30px] pr-[30px]">{children}</main>
    </div>
  );
}
