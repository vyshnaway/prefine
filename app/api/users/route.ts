import { NextRequest, NextResponse } from "next/server";
import { POCKETBASE_URL, UserAccount } from "@/app/types";
import { DEFAULT_USERS } from "@/app/lib/pocketbase";
import { STORAGE_ROOT } from "@/app/lib/storage";
import { unassignActiveTasksForUsers } from "@/app/lib/sidecar";

export const dynamic = "force-dynamic";

/** Helper to get an authenticated admin token for PocketBase */
async function getAdminToken(): Promise<string | null> {
  try {
    const res = await fetch(`${POCKETBASE_URL}/api/admins/auth-with-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identity: "admin@team.internal",
        password: "password123456",
      }),
      cache: "no-store",
    });
    const data = await res.json();
    return data.token || null;
  } catch {
    return null;
  }
}

/** Helper to read all users directly from the Database */
async function fetchDbUsers(): Promise<UserAccount[]> {
  try {
    const token = await getAdminToken();
    if (!token) return DEFAULT_USERS;

    const res = await fetch(`${POCKETBASE_URL}/api/collections/users/records?perPage=200&sort=name`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });
    const data = await res.json();
    if (Array.isArray(data.items)) {
      return data.items.map((item: any) => ({
        id: item.id,
        name: item.name || item.email?.split("@")[0] || "User",
        email: item.email,
        role: item.role || "annotator",
        avatar: item.avatar || "",
        disabled: Boolean(item.disabled),
        isArchived: Boolean(item.disabled),
      }));
    }
    return [];
  } catch (err) {
    console.error("Failed to query users from Database:", err);
    return [];
  }
}

/** GET /api/users — List all team member accounts directly from the Database */
export async function GET() {
  try {
    const users = await fetchDbUsers();
    return NextResponse.json({ ok: true, users });
  } catch (error) {
    console.error("Failed to load users from database:", error);
    return NextResponse.json({ error: "Failed to load users from database" }, { status: 500 });
  }
}

/** POST /api/users — Add a new team member directly in the Database */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as (Partial<UserAccount> & { password?: string }) | null;
    if (!body || !body.name || !body.email || !body.role) {
      return NextResponse.json({ error: "name, email, and role are required" }, { status: 400 });
    }

    const adminToken = await getAdminToken();
    if (!adminToken) {
      return NextResponse.json({ error: "Database authentication failed" }, { status: 500 });
    }

    const userPassword = body.password && body.password.trim().length >= 8 ? body.password.trim() : "password123456";

    const createRes = await fetch(`${POCKETBASE_URL}/api/collections/users/records`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        name: body.name.trim(),
        email: body.email.trim(),
        role: body.role,
        disabled: false,
        password: userPassword,
        passwordConfirm: userPassword,
      }),
    });

    const createdData = await createRes.json();
    if (!createRes.ok) {
      return NextResponse.json({ error: createdData.message || "Failed to create user in database" }, { status: 400 });
    }

    const updatedUsers = await fetchDbUsers();
    const newUser: UserAccount = {
      id: createdData.id,
      name: createdData.name || createdData.email,
      email: createdData.email,
      role: createdData.role || "annotator",
      avatar: createdData.avatar || "",
      disabled: false,
      isArchived: false,
    };

    return NextResponse.json({ ok: true, user: newUser, users: updatedUsers });
  } catch (error) {
    console.error("Failed to create user in database:", error);
    return NextResponse.json({ error: "Failed to create user in database" }, { status: 500 });
  }
}

/** PUT /api/users — Update an existing team member in the Database */
export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as (UserAccount & { password?: string }) | null;
    if (!body || !body.id) {
      return NextResponse.json({ error: "User id is required" }, { status: 400 });
    }

    const adminToken = await getAdminToken();
    if (!adminToken) {
      return NextResponse.json({ error: "Database authentication failed" }, { status: 500 });
    }

    const updatePayload: Record<string, any> = {};
    if (body.name !== undefined) updatePayload.name = body.name.trim();
    if (body.email !== undefined) updatePayload.email = body.email.trim();
    if (body.role !== undefined) updatePayload.role = body.role;
    if (body.disabled !== undefined || body.isArchived !== undefined) {
      updatePayload.disabled = Boolean(body.disabled ?? body.isArchived);
    }
    if (body.password && body.password.trim().length >= 8) {
      updatePayload.password = body.password.trim();
      updatePayload.passwordConfirm = body.password.trim();
    }

    const patchRes = await fetch(`${POCKETBASE_URL}/api/collections/users/records/${body.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify(updatePayload),
    });

    if (!patchRes.ok) {
      const errData = await patchRes.json();
      return NextResponse.json({ error: errData.message || "Failed to update user in database" }, { status: 400 });
    }

    const updatedUsers = await fetchDbUsers();
    const updatedUser = updatedUsers.find((u) => u.id === body.id) || body;

    // If user was disabled/archived, populate and unassign all their active pending tasks
    if (Boolean(body.disabled ?? body.isArchived)) {
      try {
        await unassignActiveTasksForUsers(STORAGE_ROOT, [body.id]);
      } catch (unassignErr) {
        console.warn("Failed to unassign active tasks for disabled user:", unassignErr);
      }
    }

    return NextResponse.json({ ok: true, user: updatedUser, users: updatedUsers });
  } catch (error) {
    console.error("Failed to update user in database:", error);
    return NextResponse.json({ error: "Failed to update user in database" }, { status: 500 });
  }
}

/** DELETE /api/users — Archive and disable a team member (instead of permanent deletion) */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("id");
    if (!userId) {
      return NextResponse.json({ error: "User id is required" }, { status: 400 });
    }

    const adminToken = await getAdminToken();
    if (!adminToken) {
      return NextResponse.json({ error: "Database authentication failed" }, { status: 500 });
    }

    // Rather than hard deletion, soft-disable/archive the account
    const patchRes = await fetch(`${POCKETBASE_URL}/api/collections/users/records/${userId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ disabled: true }),
    });

    if (!patchRes.ok) {
      const errData = await patchRes.json();
      return NextResponse.json({ error: errData.message || "Failed to archive user in database" }, { status: 400 });
    }

    // When archived, automatically unassign all active pending tasks for this user
    try {
      await unassignActiveTasksForUsers(STORAGE_ROOT, [userId]);
    } catch (unassignErr) {
      console.warn("Failed to unassign active tasks for archived user:", unassignErr);
    }

    const remainingUsers = await fetchDbUsers();
    return NextResponse.json({ ok: true, archivedId: userId, users: remainingUsers });
  } catch (error) {
    console.error("Failed to archive user in database:", error);
    return NextResponse.json({ error: "Failed to archive user in database" }, { status: 500 });
  }
}
