import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { hashPassword, createSessionToken } from "@/lib/auth";
import { GET as getGroups, POST as createGroup } from "@/app/api/groups/route";
import { GET as getGroupDetail } from "@/app/api/groups/[id]/route";
import { POST as addGroupMember } from "@/app/api/groups/[id]/members/route";
import { NextRequest } from "next/server";

describe("Milestone 6: Feature F12 (Groups)", () => {
  let userA: any;
  let userB: any;
  let userC: any;
  let tokenA: string;
  let tokenB: string;
  let tokenC: string;

  beforeEach(async () => {
    // Clean up test users
    const existing = await db.user.findMany({
      where: {
        email: {
          in: ["group_a@test.com", "group_b@test.com", "group_c@test.com"],
        },
      },
    });
    const ids = existing.map((u) => u.id);
    if (ids.length > 0) {
      await db.groupMember.deleteMany({ where: { userId: { in: ids } } });
      await db.group.deleteMany({ where: { createdById: { in: ids } } });
      await db.friendship.deleteMany({
        where: {
          OR: [{ userAId: { in: ids } }, { userBId: { in: ids } }],
        },
      });
      await db.user.deleteMany({ where: { id: { in: ids } } });
    }

    const passwordHash = await hashPassword("password123");
    userA = await db.user.create({
      data: { name: "Alice Group", email: "group_a@test.com", passwordHash },
    });
    userB = await db.user.create({
      data: { name: "Bob Group", email: "group_b@test.com", passwordHash },
    });
    userC = await db.user.create({
      data: { name: "Charlie NonMember", email: "group_c@test.com", passwordHash },
    });

    tokenA = await createSessionToken({
      userId: userA.id,
      email: userA.email,
      name: userA.name,
    });
    tokenB = await createSessionToken({
      userId: userB.id,
      email: userB.email,
      name: userB.name,
    });
    tokenC = await createSessionToken({
      userId: userC.id,
      email: userC.email,
      name: userC.name,
    });

    // Make Alice and Bob mutual friends
    await db.friendship.create({
      data: {
        userAId: userA.id,
        userBId: userB.id,
      },
    });
  });

  it("rejects group creation if invited member is not a friend", async () => {
    // Alice tries to invite Charlie (not a friend)
    const req = new NextRequest("http://localhost:3000/api/groups", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `session_token=${tokenA}`,
      },
      body: JSON.stringify({
        name: "Secret Club",
        memberIds: [userC.id],
      }),
    });
    const res = await createGroup(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("NOT_FRIENDS");
  });

  it("F12 Done when: group created by A with B shows in both A's and B's /groups; a non-member opening /groups/:id gets 404", async () => {
    // 1. Alice creates group with Bob
    const createReq = new NextRequest("http://localhost:3000/api/groups", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `session_token=${tokenA}`,
      },
      body: JSON.stringify({
        name: "Weekend Trip",
        memberIds: [userB.id],
      }),
    });
    const createRes = await createGroup(createReq);
    expect(createRes.status).toBe(201);
    const createData = await createRes.json();
    const groupId = createData.group.id;

    // 2. Alice lists groups: group shows up
    const aListReq = new NextRequest("http://localhost:3000/api/groups", {
      headers: { cookie: `session_token=${tokenA}` },
    });
    const aListRes = await getGroups(aListReq);
    expect(aListRes.status).toBe(200);
    const aData = await aListRes.json();
    expect(aData.groups.some((g: any) => g.id === groupId)).toBe(true);

    // 3. Bob lists groups: group shows up
    const bListReq = new NextRequest("http://localhost:3000/api/groups", {
      headers: { cookie: `session_token=${tokenB}` },
    });
    const bListRes = await getGroups(bListReq);
    expect(bListRes.status).toBe(200);
    const bData = await bListRes.json();
    expect(bData.groups.some((g: any) => g.id === groupId)).toBe(true);

    // 4. Bob opens /api/groups/:id -> 200 with members
    const bDetailReq = new NextRequest(`http://localhost:3000/api/groups/${groupId}`, {
      headers: { cookie: `session_token=${tokenB}` },
    });
    const bDetailRes = await getGroupDetail(bDetailReq, {
      params: Promise.resolve({ id: groupId }),
    });
    expect(bDetailRes.status).toBe(200);
    const bDetailData = await bDetailRes.json();
    expect(bDetailData.members.length).toBe(2);

    // 5. Non-member Charlie opens /api/groups/:id -> 404
    const cDetailReq = new NextRequest(`http://localhost:3000/api/groups/${groupId}`, {
      headers: { cookie: `session_token=${tokenC}` },
    });
    const cDetailRes = await getGroupDetail(cDetailReq, {
      params: Promise.resolve({ id: groupId }),
    });
    expect(cDetailRes.status).toBe(404);

    // 6. Alice befriends Charlie, then adds Charlie to group later
    await db.friendship.create({
      data: { userAId: userA.id, userBId: userC.id },
    });

    const addMemberReq = new NextRequest(
      `http://localhost:3000/api/groups/${groupId}/members`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `session_token=${tokenA}`,
        },
        body: JSON.stringify({ userId: userC.id }),
      }
    );
    const addMemberRes = await addGroupMember(addMemberReq, {
      params: Promise.resolve({ id: groupId }),
    });
    expect(addMemberRes.status).toBe(200);

    // Now Charlie is a member and can view /api/groups/:id
    const cNowDetailRes = await getGroupDetail(cDetailReq, {
      params: Promise.resolve({ id: groupId }),
    });
    expect(cNowDetailRes.status).toBe(200);
  });
});
