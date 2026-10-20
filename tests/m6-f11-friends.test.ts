import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { hashPassword, createSessionToken } from "@/lib/auth";
import { GET as getFriends, POST as addFriend } from "@/app/api/friends/route";
import { GET as getFriendDetail } from "@/app/api/friends/[id]/route";
import { NextRequest } from "next/server";

describe("Milestone 6: Feature F11 (Friends)", () => {
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
          in: ["friend_a@test.com", "friend_b@test.com", "friend_c@test.com"],
        },
      },
    });
    const ids = existing.map((u) => u.id);
    if (ids.length > 0) {
      await db.friendship.deleteMany({
        where: {
          OR: [{ userAId: { in: ids } }, { userBId: { in: ids } }],
        },
      });
      await db.user.deleteMany({ where: { id: { in: ids } } });
    }

    const passwordHash = await hashPassword("password123");
    userA = await db.user.create({
      data: { name: "Alice Friend", email: "friend_a@test.com", passwordHash },
    });
    userB = await db.user.create({
      data: { name: "Bob Friend", email: "friend_b@test.com", passwordHash },
    });
    userC = await db.user.create({
      data: { name: "Charlie Stranger", email: "friend_c@test.com", passwordHash },
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
  });

  it("returns 401 when unauthenticated", async () => {
    const req = new NextRequest("http://localhost:3000/api/friends");
    const res = await getFriends(req);
    expect(res.status).toBe(401);
  });

  it("returns 'No user with that email' when adding an unregistered email", async () => {
    const req = new NextRequest("http://localhost:3000/api/friends", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `session_token=${tokenA}`,
      },
      body: JSON.stringify({ email: "unknown@example.com" }),
    });
    const res = await addFriend(req);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error.message).toBe("No user with that email");
  });

  it("prevents adding oneself as a friend", async () => {
    const req = new NextRequest("http://localhost:3000/api/friends", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `session_token=${tokenA}`,
      },
      body: JSON.stringify({ email: userA.email }),
    });
    const res = await addFriend(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("CANNOT_FRIEND_SELF");
  });

  it("F11 Done when: adding a registered email shows that person in /friends for both users", async () => {
    // Alice adds Bob
    const addReq = new NextRequest("http://localhost:3000/api/friends", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `session_token=${tokenA}`,
      },
      body: JSON.stringify({ email: userB.email }),
    });
    const addRes = await addFriend(addReq);
    expect(addRes.status).toBe(201);
    const addJson = await addRes.json();
    expect(addJson.friend.email).toBe(userB.email);

    // Alice checks /friends: Bob is in list
    const aliceReq = new NextRequest("http://localhost:3000/api/friends", {
      headers: { cookie: `session_token=${tokenA}` },
    });
    const aliceRes = await getFriends(aliceReq);
    expect(aliceRes.status).toBe(200);
    const aliceData = await aliceRes.json();
    expect(aliceData.friends.length).toBe(1);
    expect(aliceData.friends[0].email).toBe(userB.email);
    expect(aliceData.friends[0].balanceMinor).toBe(0);

    // Bob checks /friends: Alice is in list (mutual instant friendship)
    const bobReq = new NextRequest("http://localhost:3000/api/friends", {
      headers: { cookie: `session_token=${tokenB}` },
    });
    const bobRes = await getFriends(bobReq);
    expect(bobRes.status).toBe(200);
    const bobData = await bobRes.json();
    expect(bobData.friends.length).toBe(1);
    expect(bobData.friends[0].email).toBe(userA.email);
    expect(bobData.friends[0].balanceMinor).toBe(0);

    // Alice opens /api/friends/:id for Bob
    const detailReq = new NextRequest(`http://localhost:3000/api/friends/${userB.id}`, {
      headers: { cookie: `session_token=${tokenA}` },
    });
    const detailRes = await getFriendDetail(detailReq, {
      params: Promise.resolve({ id: userB.id }),
    });
    expect(detailRes.status).toBe(200);
    const detailData = await detailRes.json();
    expect(detailData.friend.name).toBe("Bob Friend");

    // Stranger Charlie opens /api/friends/:id for Bob -> 404
    const strangerReq = new NextRequest(`http://localhost:3000/api/friends/${userB.id}`, {
      headers: { cookie: `session_token=${tokenC}` },
    });
    const strangerRes = await getFriendDetail(strangerReq, {
      params: Promise.resolve({ id: userB.id }),
    });
    expect(strangerRes.status).toBe(404);
  });
});
