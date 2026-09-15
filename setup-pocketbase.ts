/* eslint-disable @typescript-eslint/no-explicit-any */
import PocketBase from "pocketbase";

const POCKETBASE_URL = "http://127.0.0.1:8099";
const pb = new PocketBase(POCKETBASE_URL);

async function setupSchema() {
  console.log("Connecting to PocketBase at", POCKETBASE_URL, "...");

  try {
    // 1. Authenticate as admin
    const authRes = await fetch(`${POCKETBASE_URL}/api/admins/auth-with-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identity: "admin@team.internal",
        password: "password123456",
      }),
    });
    const authData = await authRes.json();
    if (!authData.token) {
      throw new Error(`Admin auth failed: ${JSON.stringify(authData)}`);
    }
    pb.authStore.save(authData.token, authData.admin);
    console.log("✓ Authenticated as Admin");

    // 2. Configure 'users' collection to include 'role' and 'disabled'
    let usersCol = await pb.collections.getOne("users");
    try {
      const hasRole = (usersCol.schema as any[])?.some((f: any) => f.name === "role");
      let changed = false;
      if (!hasRole) {
        usersCol.schema.push({
          name: "role",
          type: "select",
          options: {
            maxSelect: 1,
            values: ["admin", "annotator", "reviewer"],
          },
        });
        changed = true;
      }
      const hasDisabled = (usersCol.schema as any[])?.some((f: any) => f.name === "disabled");
      if (!hasDisabled) {
        usersCol.schema.push({
          name: "disabled",
          type: "bool",
        });
        changed = true;
      }
      if (changed) {
        usersCol = await pb.collections.update(usersCol.id, usersCol);
        console.log("✓ Updated 'users' collection with role and disabled fields");
      }
    } catch (err: any) {
      console.warn("Notice for users collection:", err?.message || err);
    }

    // 3. Create 'roles' collection
    try {
      const existing = await pb.collections.getOne("roles").catch(() => null);
      if (!existing) {
        await pb.collections.create({
          name: "roles",
          type: "base",
          schema: [
            { name: "role_id", type: "text", required: true },
            { name: "name", type: "text", required: true },
            { name: "description", type: "text" },
            { name: "color", type: "text" },
          ],
          listRule: "",
          viewRule: "",
          createRule: "",
          updateRule: "",
          deleteRule: "",
        });
        console.log("✓ Created 'roles' collection");
      } else {
        console.log("✓ 'roles' collection already exists");
      }

      // Seed default roles if empty
      const defaultRoles = [
        { role_id: "annotator", name: "Annotator", description: "Segment masks & repair layers", color: "emerald" },
        { role_id: "reviewer", name: "Reviewer", description: "QA inspection & export review", color: "blue" },
        { role_id: "admin", name: "Admin", description: "Full workspace & batch control", color: "purple" },
      ];

      for (const r of defaultRoles) {
        try {
          const found = await pb.collection("roles").getFirstListItem(`role_id = "${r.role_id}"`, { requestKey: null }).catch(() => null);
          if (!found) {
            await pb.collection("roles").create(r, { requestKey: null });
            console.log(`✓ Seeded role: ${r.name}`);
          }
        } catch { }
      }
    } catch (err: any) {
      console.warn("roles error:", err?.message || err);
    }

    // 4. Create / Update 'metafolders' collection
    let metafoldersCol: any = null;
    try {
      metafoldersCol = await pb.collections.getOne("metafolders").catch(() => null);
      if (!metafoldersCol) {
        metafoldersCol = await pb.collections.create({
          name: "metafolders",
          type: "base",
          schema: [
            { name: "folderPath", type: "text", required: true },
            { name: "filesCount", type: "number" },
            { name: "foldersCount", type: "number" },
            {
              name: "assignedTo",
              type: "relation",
              options: {
                collectionId: usersCol.id,
                cascadeDelete: false,
                maxSelect: 1,
              },
            },
            {
              name: "status",
              type: "select",
              options: {
                maxSelect: 1,
                values: ["unassigned", "assigned", "progressing", "commented", "completed"],
              },
            },
            { name: "createdAt", type: "date" },
            { name: "updatedAt", type: "date" },
          ],
          listRule: "",
          viewRule: "",
          createRule: "",
          updateRule: "",
          deleteRule: "",
        });

        // Add parentMetafolder self-referencing relation
        metafoldersCol.schema.push({
          name: "parentMetafolder",
          type: "relation",
          options: {
            collectionId: metafoldersCol.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
        });
        metafoldersCol = await pb.collections.update(metafoldersCol.id, metafoldersCol);
        console.log("✓ Created 'metafolders' collection");
      } else {
        console.log("✓ 'metafolders' collection already exists");
      }
    } catch (err: any) {
      console.warn("metafolders setup note:", err?.message || err);
    }

    // 5. Create / Update 'metafiles' collection
    try {
      metafoldersCol = await pb.collections.getOne("metafolders");
      let metafilesCol = await pb.collections.getOne("metafiles").catch(() => null);

      const expectedSchema: any[] = [
        { name: "name", type: "text", required: true },
        { name: "width", type: "number" },
        { name: "height", type: "number" },
        { name: "issues", type: "json", options: { maxSize: 2000000 } },
        { name: "comment", type: "text" },
        { name: "thumbnail", type: "text" },

        // Destructured File Sizes
        { name: "sizeRaw", type: "number" },
        { name: "sizePng", type: "number" },
        { name: "sizeJpeg", type: "number" },
        { name: "sizeWebp", type: "number" },

        // Destructured Toolbar Settings (prefixed with prop_)
        { name: "prop_imageVisibility", type: "bool" },
        { name: "prop_maskVisibility", type: "bool" },
        { name: "prop_brushMode", type: "text" },
        { name: "prop_brushSize", type: "number" },
        { name: "prop_brushHardness", type: "number" },
        { name: "prop_brushOpacity", type: "number" },
        { name: "prop_brushColor", type: "text" },
        { name: "prop_swapMouseClicks", type: "bool" },
        { name: "prop_maskOpacity", type: "number" },
        { name: "prop_thresholdValue", type: "number" },
        { name: "prop_thresholdValueEnabled", type: "bool" },
        { name: "prop_traceMinBlobPixels", type: "number" },
        { name: "prop_traceMinBlobPixelsEnabled", type: "bool" },
        { name: "prop_simplifyEpsilon", type: "number" },
        { name: "prop_simplifyEpsilonEnabled", type: "bool" },
        { name: "prop_smoothIterations", type: "number" },
        { name: "prop_smoothIterationsEnabled", type: "bool" },
        { name: "prop_contourOffset", type: "number" },
        { name: "prop_contourOffsetEnabled", type: "bool" },
        { name: "prop_feather", type: "number" },
        { name: "prop_featherEnabled", type: "bool" },
        { name: "prop_imageOpacity", type: "number" },
        { name: "prop_splineCurviness", type: "number" },

        // Status, Timestamps & Auditing
        {
          name: "status",
          type: "select",
          options: {
            maxSelect: 1,
            values: ["unassigned", "assigned", "progressing", "commented", "completed"],
          },
        },
        {
          name: "priority",
          type: "select",
          options: {
            maxSelect: 1,
            values: ["low", "medium", "high"],
          },
        },
        { name: "createdAt", type: "date" },
        { name: "updatedAt", type: "date" },
        { name: "exportedAt", type: "date" },
        { name: "lastIngestedAt", type: "date" },
        { name: "hasSidecar", type: "bool" },
      ];

      if (metafoldersCol?.id) {
        expectedSchema.push({
          name: "metafolder",
          type: "relation",
          options: {
            collectionId: metafoldersCol.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
        });
      }

      if (usersCol?.id) {
        expectedSchema.push({
          name: "assignedTo",
          type: "relation",
          options: {
            collectionId: usersCol.id,
            cascadeDelete: false,
            maxSelect: 1,
          },
        });
      }

      if (!metafilesCol) {
        metafilesCol = await pb.collections.create({
          name: "metafiles",
          type: "base",
          schema: expectedSchema,
          listRule: "",
          viewRule: "",
          createRule: "",
          updateRule: "",
          deleteRule: "",
        });
        console.log("✓ Created 'metafiles' collection");
      } else {
        const currentSchema = (metafilesCol.schema || []) as any[];
        let schemaUpdated = false;
        for (const field of expectedSchema) {
          if (!currentSchema.some((f: any) => f.name === field.name)) {
            currentSchema.push(field);
            schemaUpdated = true;
          }
        }

        if (schemaUpdated) {
          metafilesCol.schema = currentSchema;
          await pb.collections.update(metafilesCol.id, metafilesCol);
          console.log("✓ Updated 'metafiles' collection schema with missing fields");
        } else {
          console.log("✓ 'metafiles' collection schema is up to date");
        }
      }
    } catch (err: any) {
      console.warn("metafiles setup note:", JSON.stringify(err?.data || err?.message || err, null, 2));
    }

    // 6. Create 'workers' collection
    try {
      const existing = await pb.collections.getOne("workers").catch(() => null);
      if (!existing) {
        await pb.collections.create({
          name: "workers",
          type: "base",
          schema: [
            { name: "worker_id", type: "text", required: true },
            { name: "name", type: "text", required: true },
            { name: "url", type: "text", required: true },
            { name: "enabled", type: "bool" },
          ],
          listRule: "",
          viewRule: "",
          createRule: "",
          updateRule: "",
          deleteRule: "",
        });
        console.log("✓ Created 'workers' collection");
      } else {
        console.log("✓ 'workers' collection already exists");
      }
    } catch (err: any) {
      console.warn("workers setup note:", err?.message || err);
    }

    // 6. Seed default team accounts if not already created
    const defaultAccounts = [
      { name: "Admin", email: "admin@email.com", role: "admin", password: "password", passwordConfirm: "password" },
      { name: "User 1", email: "user1@email.com", role: "annotator", password: "password", passwordConfirm: "password" },
      { name: "User 2", email: "user2@email.com", role: "reviewer", password: "password", passwordConfirm: "password" },
    ];

    for (const acc of defaultAccounts) {
      try {
        const exists = await pb.collection("users").getFirstListItem(`email = "${acc.email}"`).catch(() => null);
        if (!exists) {
          await pb.collection("users").create(acc);
          console.log(`✓ Created user: ${acc.name} (${acc.email})`);
        }
      } catch (uErr: any) {
        console.warn(`User error for ${acc.email}:`, JSON.stringify(uErr?.data || uErr?.message || uErr));
      }
    }

    console.log("\n🎉 PocketBase Database setup completed successfully!");
  } catch (err) {
    console.error("Setup failed:", err);
  }
}

setupSchema();
