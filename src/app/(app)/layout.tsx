import { requireUser, isInstagramOwner } from "@/lib/auth";
import { Sidebar } from "@/components/Sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar userName={user.name} isAdmin={user.role === "admin"} showInstagram={isInstagramOwner(user)} />
      {/* pt-[68px] clears the fixed mobile top bar (52px tall + margin);
          md: reverts to the original desktop padding on every side. */}
      <main className="min-w-0 flex-1 overflow-y-auto p-4 pt-[68px] md:p-[26px] md:pb-[30px] md:pl-[30px] md:pr-[30px] md:pt-[26px]">
        {children}
      </main>
    </div>
  );
}
