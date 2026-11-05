import { and, asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { VersionDefinition } from "./engine/types";
import { applyChanges, checkDefinition, diffDefinitions, labelOf, nextNumber, numberOf, VersionError, type StepChange, type StepEdit } from "./version-logic";

export * from "./version-logic";

export async function getVersion(id: number) {
  const [v] = await db().select().from(schema.versions).where(eq(schema.versions.id, id));
  if (!v) return null;
  const [f] = await db().select().from(schema.families).where(eq(schema.families.id, v.familyId));
  return { ...v, family: f.name, number: numberOf(v), label: labelOf(f.name, v), definition: v.definition as VersionDefinition };
}

export async function listVersions(familyId?: number) {
  const rows = await db()
    .select({ v: schema.versions, f: schema.families })
    .from(schema.versions)
    .innerJoin(schema.families, eq(schema.families.id, schema.versions.familyId))
    .where(familyId ? eq(schema.versions.familyId, familyId) : undefined)
    .orderBy(asc(schema.versions.familyId), asc(schema.versions.major), asc(schema.versions.minor));
  return rows.map(({ v, f }) => ({
    id: v.id,
    familyId: v.familyId,
    family: f.name,
    number: numberOf(v),
    label: labelOf(f.name, v),
    author: v.author,
    parentId: v.parentId,
    note: v.note,
    createdAt: v.createdAt,
    stepCount: (v.definition as VersionDefinition).steps.length,
  }));
}

/**
 * Creates a version. Either a full definition, or a parent plus changes.
 * With `newFamily`, the version starts a new family at 1.0 (a copy).
 */
export async function createVersion(input: {
  author?: string;
  note?: string;
  parentId?: number | null;
  definition?: unknown;
  changes?: StepChange[];
  edits?: StepEdit[];
  newFamily?: string;
  familyId?: number;
}) {
  const author = input.author?.trim() || "api";
  let parent: Awaited<ReturnType<typeof getVersion>> = null;
  if (input.parentId) {
    parent = await getVersion(input.parentId);
    if (!parent) throw new VersionError(`parent version ${input.parentId} does not exist`);
  }
  let def: VersionDefinition;
  if (input.definition) def = checkDefinition(input.definition);
  else if (parent) def = checkDefinition(applyChanges(parent.definition, input.changes, input.edits));
  else throw new VersionError("Give a definition, or a parent_id with changes.");

  let familyId: number;
  let num: { major: number; minor: number };
  if (input.newFamily) {
    const name = input.newFamily.trim();
    const [exists] = await db().select().from(schema.families).where(eq(schema.families.name, name));
    if (exists) throw new VersionError(`a family named "${name}" exists`);
    const [f] = await db().insert(schema.families).values({ name, description: parent ? `Copied from ${parent.label}.` : null }).returning();
    familyId = f.id;
    num = { major: 1, minor: 0 };
  } else {
    familyId = parent?.familyId ?? input.familyId ?? 0;
    if (!familyId) throw new VersionError("Give a parent_id, a family_id or new_family.");
    const existing = await db().select({ major: schema.versions.major, minor: schema.versions.minor }).from(schema.versions).where(eq(schema.versions.familyId, familyId));
    const major = parent?.major ?? (existing.length ? Math.max(...existing.map((e) => e.major)) : 1);
    num = nextNumber(existing, major);
  }
  const [v] = await db()
    .insert(schema.versions)
    .values({ familyId, major: num.major, minor: num.minor, author, parentId: parent?.id ?? null, note: input.note ?? null, definition: def as never })
    .returning();
  const created = await getVersion(v.id);
  if (!created) throw new VersionError("the version was not saved");
  return { ...created, diff: parent ? diffDefinitions(parent.definition, def) : [] };
}

export async function familiesWithVersions() {
  const fams = await db().select().from(schema.families).orderBy(asc(schema.families.id));
  const versions = await listVersions();
  return fams.map((f) => ({ ...f, versions: versions.filter((v) => v.familyId === f.id) }));
}

export async function latestOf(familyName: string) {
  const [f] = await db().select().from(schema.families).where(eq(schema.families.name, familyName));
  if (!f) return null;
  const [v] = await db().select().from(schema.versions).where(and(eq(schema.versions.familyId, f.id))).orderBy(desc(schema.versions.id)).limit(1);
  return v ?? null;
}
