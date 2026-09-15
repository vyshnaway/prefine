import { NextRequest, NextResponse } from "next/server";
import { POCKETBASE_URL, RoleDefinition } from "@/app/types";
import { DEFAULT_ROLES } from "@/app/lib/pocketbase";

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

/** Helper to read all roles directly from PocketBase */
async function fetchDbRoles(): Promise<RoleDefinition[]> {
  try {
    const token = await getAdminToken();
    if (!token) return DEFAULT_ROLES;

    const res = await fetch(`${POCKETBASE_URL}/api/collections/roles/records?perPage=100&sort=name`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });
    const data = await res.json();
    if (Array.isArray(data.items) && data.items.length > 0) {
      return data.items.map((item: any) => ({
        id: item.role_id || item.id,
        name: item.name,
        description: item.description || "",
        color: item.color || "emerald",
      }));
    }
    return DEFAULT_ROLES;
  } catch (err) {
    console.error("Failed to query roles from Database:", err);
    return DEFAULT_ROLES;
  }
}

/** GET /api/roles — List all defined user roles from Database */
export async function GET() {
  try {
    const roles = await fetchDbRoles();
    return NextResponse.json({ ok: true, roles });
  } catch (error) {
    console.error("Failed to load roles from database:", error);
    return NextResponse.json({ error: "Failed to load roles" }, { status: 500 });
  }
}

/** POST /api/roles — Add a new custom role directly in Database */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as Partial<RoleDefinition> | null;
    if (!body || !body.name) {
      return NextResponse.json({ error: "Role name is required" }, { status: 400 });
    }

    const adminToken = await getAdminToken();
    if (!adminToken) {
      return NextResponse.json({ error: "Database authentication failed" }, { status: 500 });
    }

    const roleId = (body.id || body.name).trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");

    const createRes = await fetch(`${POCKETBASE_URL}/api/collections/roles/records`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        role_id: roleId,
        name: body.name.trim(),
        description: body.description ? body.description.trim() : "",
        color: body.color || "emerald",
      }),
    });

    if (!createRes.ok) {
      const errData = await createRes.json();
      return NextResponse.json({ error: errData.message || "Failed to create role in database" }, { status: 400 });
    }

    const updatedRoles = await fetchDbRoles();
    const newRole: RoleDefinition = {
      id: roleId,
      name: body.name.trim(),
      description: body.description ? body.description.trim() : "",
      color: body.color || "emerald",
    };

    return NextResponse.json({ ok: true, role: newRole, roles: updatedRoles });
  } catch (error) {
    console.error("Failed to create role in database:", error);
    return NextResponse.json({ error: "Failed to create role in database" }, { status: 500 });
  }
}

/** PUT /api/roles — Update an existing role in Database */
export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as RoleDefinition | null;
    if (!body || !body.id) {
      return NextResponse.json({ error: "Role id is required" }, { status: 400 });
    }

    const adminToken = await getAdminToken();
    if (!adminToken) {
      return NextResponse.json({ error: "Database authentication failed" }, { status: 500 });
    }

    // Find record by role_id
    const searchRes = await fetch(
      `${POCKETBASE_URL}/api/collections/roles/records?filter=(role_id='${encodeURIComponent(body.id)}')`,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    const searchData = await searchRes.json();
    const record = searchData.items?.[0];

    if (record?.id) {
      await fetch(`${POCKETBASE_URL}/api/collections/roles/records/${record.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: body.name !== undefined ? body.name.trim() : record.name,
          description: body.description !== undefined ? body.description.trim() : record.description,
          color: body.color !== undefined ? body.color : record.color,
        }),
      });
    }

    const updatedRoles = await fetchDbRoles();
    const updatedRole = updatedRoles.find((r) => r.id === body.id) || body;

    return NextResponse.json({ ok: true, role: updatedRole, roles: updatedRoles });
  } catch (error) {
    console.error("Failed to update role in database:", error);
    return NextResponse.json({ error: "Failed to update role in database" }, { status: 500 });
  }
}

/** DELETE /api/roles — Delete a custom role from Database */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const roleId = searchParams.get("id");
    if (!roleId) {
      return NextResponse.json({ error: "Role id is required" }, { status: 400 });
    }

    const adminToken = await getAdminToken();
    if (!adminToken) {
      return NextResponse.json({ error: "Database authentication failed" }, { status: 500 });
    }

    // Find record by role_id
    const searchRes = await fetch(
      `${POCKETBASE_URL}/api/collections/roles/records?filter=(role_id='${encodeURIComponent(roleId)}')`,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    const searchData = await searchRes.json();
    const record = searchData.items?.[0];

    if (record?.id) {
      await fetch(`${POCKETBASE_URL}/api/collections/roles/records/${record.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${adminToken}` },
      });
    }

    const remainingRoles = await fetchDbRoles();
    return NextResponse.json({ ok: true, deletedId: roleId, roles: remainingRoles });
  } catch (error) {
    console.error("Failed to delete role from database:", error);
    return NextResponse.json({ error: "Failed to delete role from database" }, { status: 500 });
  }
}
