import { createTestUser, createTestUserWithGroup } from "../utils.js";

const testUsername = "test_user";
const testGroupId = "test_group_server";

// In collection-hooks v2, before.find hooks receive (userId, selector, options)
// as direct parameters. selector is always a normalized object:
//   - find()        → selector = {} (via _getFindSelector)
//   - find({x: 1})  → selector = {x: 1}
//   - find("id")    → selector = {_id: "id"} (via normalizeSelector)
// Hooks mutate selector/options in place — changes are visible to the original find().

  (async () => {
  Meteor.methods({
    setAdmin: async function(value) {
      const userId = Meteor.userId();
      if (!userId) throw new Meteor.Error(403, "not logged in");
      if (value) {
        await Meteor.users.updateAsync(userId, {$set: {admin: true}});
      } else {
        await Meteor.users.updateAsync(userId, {$unset: {admin: null}});
      }
    }
  });


  const originalUserId = Meteor.userId;
  Meteor.userId = () => userId;

  // =====================
  // findHook tests
  // =====================

  Tinytest.addAsync("partitioner - hooks - find with empty selector (no args)", async (test) => {
    // Simulates find() — _getFindSelector returns {}, normalizeSelector passes through
    const selector = {};

    const userId = await createTestUserWithGroup(testUsername, testGroupId);

    Partitioner.bindGroup(testGroupId, () => {
      TestFuncs.findHook.call({}, userId, selector, undefined);
    });
    // Should add _groupId to the selector object
    test.equal(selector._groupId, testGroupId);
  });

  Tinytest.addAsync("partitioner - hooks - find with selector adds _groupId", async (test) => {
    const selector = {foo: "bar"};

    const userId = await createTestUserWithGroup(testUsername, testGroupId);

    Partitioner.bindGroup(testGroupId, () => {
      TestFuncs.findHook.call({}, userId, selector, undefined);
    });
    test.equal(selector.foo, "bar");
    test.equal(selector._groupId, testGroupId);
  });

  Tinytest.addAsync("partitioner - hooks - find with no group throws", async (test) => {
    const selector = {};

    // Should throw if user is not logged in (no userId, no group)
    test.throws(() => {
      TestFuncs.findHook.call({}, undefined, selector, undefined);
    }, (e) => e.error === 403 && e.reason === ErrMsg.userIdErr);
  });

  Tinytest.addAsync("partitioner - hooks - find with single _id bypasses (direct selector)", async (test) => {
    // normalizeSelector("id") → {_id: "id"}, which is a direct selector
    const selector = {_id: "yabbadabbadoo"};

    const userId = await createTestUserWithGroup(testUsername, testGroupId);

    TestFuncs.findHook.call({}, userId, selector, undefined);
    // Direct ID selector should bypass — no _groupId added
    test.equal(selector._id, "yabbadabbadoo");
    test.isFalse(!!selector._groupId);
  });

  Tinytest.addAsync("partitioner - hooks - find with complex _id adds _groupId", async (test) => {
    // {_id: {$ne: ...}} is NOT a direct selector
    const selector = {_id: {$ne: "yabbadabbadoo"}};
    const options = {};

    const userId = await createTestUserWithGroup(testUsername, testGroupId);

    Partitioner.bindGroup(testGroupId, () => {
      TestFuncs.findHook.call({}, userId, selector, options);
    });
    // Should modify for complex _id
    test.equal(selector._id.$ne, "yabbadabbadoo");
    test.equal(selector._groupId, testGroupId);

    // Should add projection to hide _groupId
    test.isTrue(options.projection != null);
    test.equal(options.projection._groupId, 0);
  });

  Tinytest.addAsync("partitioner - hooks - find with inclusion fields does not hide _groupId", async (test) => {
    const selector = {foo: "bar"};
    const options = {projection: {foo: 1}};

    const userId = await createTestUserWithGroup(testUsername, testGroupId);

    Partitioner.bindGroup(testGroupId, () => {
      TestFuncs.findHook.call({}, userId, selector, options);
    });
    test.equal(selector.foo, "bar");
    test.equal(selector._groupId, testGroupId);

    // Inclusion projection — should NOT add _groupId: 0 (would conflict)
    test.equal(options.projection.foo, 1);
    test.isFalse(options.projection._groupId != null);
  });

  Tinytest.addAsync("partitioner - hooks - find with exclusion fields hides _groupId", async (test) => {
    const selector = {foo: "bar"};
    const options = {projection: {foo: 0}};

    const userId = await createTestUserWithGroup(testUsername, testGroupId);

    Partitioner.bindGroup(testGroupId, () => {
      TestFuncs.findHook.call({}, userId, selector, options);
    });
    test.equal(selector.foo, "bar");
    test.equal(selector._groupId, testGroupId);

    // Exclusion projection — should add _groupId: 0
    test.equal(options.projection.foo, 0);
    test.equal(options.projection._groupId, 0);
  });

  Tinytest.addAsync("partitioner - hooks - find with null options skips projection", async (test) => {
    // In collection-hooks v2, when options is null we cannot replace it.
    // The hook should still add _groupId to selector but skip projection.
    const selector = {foo: "bar"};

    const userId = await createTestUserWithGroup(testUsername, testGroupId);

    Partitioner.bindGroup(testGroupId, () => {
      TestFuncs.findHook.call({}, userId, selector, null);
    });
    test.equal(selector._groupId, testGroupId);
    // options was null — no projection could be added (harmless)
  });

  // =====================
  // insertHook tests
  // =====================

  Tinytest.addAsync("partitioner - hooks - insert doc", async (test) => {
    const doc = {foo: "bar"};
    const userId = await createTestUserWithGroup(testUsername, testGroupId);

    await TestFuncs.insertHook.call({}, userId, doc);

    test.equal(doc.foo, "bar");
    test.equal(doc._groupId, testGroupId);
  });

  // =====================
  // userFindHook tests
  // =====================

  Tinytest.addAsync("partitioner - hooks - user find with empty selector (no args)", async (test) => {
    // Simulates find() — selector becomes {} after _getFindSelector + normalizeSelector
    const userId = await createTestUserWithGroup(testUsername, testGroupId);
    const ungroupedUserId = await createTestUser();

    // No userId — should pass through unchanged
    const selector1 = {};
    await Partitioner.bindUserGroup(userId, () => {
      TestFuncs.userFindHook.call({}, undefined, selector1, undefined);
    });
    test.isFalse(!!selector1.group);

    // Ungrouped user should throw an error
    const selector2 = {};
    test.throws(() => {
        TestFuncs.userFindHook.call({}, ungroupedUserId, selector2, undefined);
    }, (e) => e.error === 403 && e.reason === ErrMsg.groupFindErr);

    // Grouped user — should add group and admin filter
    const selector3 = {};
    await Partitioner.bindUserGroup(userId, () => {
      TestFuncs.userFindHook.call({}, userId, selector3, undefined);
    });
    test.equal(selector3.group, testGroupId);
    test.equal(selector3.admin.$exists, false);
  });

  Tinytest.addAsync("partitioner - hooks - user find with environment group but no userId", async (test) => {
    const selector = {};

    await Partitioner.bindGroup(testGroupId, () => {
      TestFuncs.userFindHook.call({}, undefined, selector, undefined);
    });
    // Should have set the group filter
    test.equal(selector.group, testGroupId);
    test.equal(selector.admin.$exists, false);
  });

  Tinytest.addAsync("partitioner - hooks - user find with string id bypasses (direct selector)", async (test) => {
    // normalizeSelector("id") → {_id: "id"}, which is a direct user selector
    const selector = {_id: "yabbadabbadoo"};

    const userId = await createTestUserWithGroup(testUsername, testGroupId);

    TestFuncs.userFindHook.call({}, undefined, selector, undefined);
    // Direct selector — no modification
    test.equal(selector._id, "yabbadabbadoo");
    test.isFalse(!!selector.group);

    TestFuncs.userFindHook.call({}, userId, selector, undefined);
    // Still no modification for direct selector
    test.equal(selector._id, "yabbadabbadoo");
    test.isFalse(!!selector.group);
  });

  Tinytest.addAsync("partitioner - hooks - user find with single _id bypasses", async (test) => {
    const selector = {_id: "yabbadabbadoo"};

    const userId = await createTestUserWithGroup(testUsername, testGroupId);

    Partitioner.bindUserGroup(userId, () => {
      TestFuncs.userFindHook.call({}, undefined, selector, undefined);
    });
    test.equal(selector._id, "yabbadabbadoo");
    test.isFalse(!!selector.group);

    Partitioner.bindUserGroup(userId, () => {
      TestFuncs.userFindHook.call({}, userId, selector, undefined);
    });
    test.equal(selector._id, "yabbadabbadoo");
    test.isFalse(!!selector.group);
  });

  Tinytest.addAsync("partitioner - hooks - user find with _id: $in bypasses", async (test) => {
    const selector = {_id: {$in: ["yabbadabbadoo"]}};

    TestFuncs.userFindHook.call({}, undefined, selector, undefined);
    test.equal(selector._id.$in[0], "yabbadabbadoo");
    test.isFalse(!!selector.group);

    const userId = await createTestUserWithGroup(testUsername, testGroupId);

    TestFuncs.userFindHook.call({}, userId, selector, undefined);
    test.equal(selector._id.$in[0], "yabbadabbadoo");
    test.isFalse(!!selector.group);
  });

  Tinytest.addAsync("partitioner - hooks - user find with complex _id adds group", async (test) => {
    const notInGroup = "not_in_group";
    const userId = await createTestUserWithGroup(testUsername, testGroupId);
    const ungroupedUserId = await createTestUser();

    // No userId with group context — passes through
    const selector1 = {_id: {$ne: notInGroup}};
    await Partitioner.bindUserGroup(userId, () => {
      TestFuncs.userFindHook.call({}, undefined, selector1, undefined);
    });
    test.equal(selector1._id.$ne, notInGroup);
    test.isFalse(!!selector1.group);

    // Ungrouped user should throw an error
    const selector2 = {_id: {$ne: notInGroup}};
    test.throws(() => {
      TestFuncs.userFindHook.call({}, ungroupedUserId, selector2, undefined);
    }, (e) => e.error === 403 && e.reason === ErrMsg.groupFindErr);

    // Grouped user — should add group filter
    const selector3 = {_id: {$ne: notInGroup}};
    await Partitioner.bindUserGroup(userId, () => {
      TestFuncs.userFindHook.call({}, userId, selector3, undefined);
    });
    test.equal(selector3._id.$ne, notInGroup);
    test.equal(selector3.group, testGroupId);
    test.equal(selector3.admin.$exists, false);
  });

  Tinytest.addAsync("partitioner - hooks - user find with username bypasses (direct selector)", async (test) => {
    const selector = {username: "yabbadabbadoo"};

    const userId = await createTestUserWithGroup(testUsername, testGroupId);

    TestFuncs.userFindHook.call({}, undefined, selector, undefined);
    test.equal(selector.username, "yabbadabbadoo");
    test.isFalse(!!selector.group);

    TestFuncs.userFindHook.call({}, userId, selector, undefined);
    test.equal(selector.username, "yabbadabbadoo");
    test.isFalse(!!selector.group);
  });

  Tinytest.addAsync("partitioner - hooks - user find with complex username adds group", async (test) => {
    const userId = await createTestUserWithGroup(testUsername, testGroupId);
    const ungroupedUserId = await createTestUser();

    const selector1 = {username: {$ne: "yabbadabbadoo"}};
    TestFuncs.userFindHook.call({}, undefined, selector1, undefined);
    test.equal(selector1.username.$ne, "yabbadabbadoo");
    test.isFalse(!!selector1.group);

    // Ungrouped user should throw
    const selector2 = {username: {$ne: "yabbadabbadoo"}};
    test.throws(() => {
      TestFuncs.userFindHook.call({}, ungroupedUserId, selector2, undefined);
    }, (e) => e.error === 403 && e.reason === ErrMsg.groupFindErr);

    const selector3 = {username: {$ne: "yabbadabbadoo"}};
    await Partitioner.bindUserGroup(userId, () => {
      TestFuncs.userFindHook.call({}, userId, selector3, undefined);
    });
    test.equal(selector3.username.$ne, "yabbadabbadoo");
    test.equal(selector3.group, testGroupId);
    test.equal(selector3.admin.$exists, false);
  });

  Tinytest.addAsync("partitioner - hooks - user find with selector adds group", async (test) => {
    const userId = await createTestUserWithGroup(testUsername, testGroupId);
    const ungroupedUserId = await createTestUser();

    // No userId with group context — passes through
    const selector1 = {foo: "bar"};
    await Partitioner.bindUserGroup(userId, () => {
      TestFuncs.userFindHook.call({}, undefined, selector1, undefined);
    });
    test.equal(selector1.foo, "bar");
    test.isFalse(!!selector1.group);

    // Ungrouped user should throw
    const selector2 = {foo: "bar"};
    test.throws(() => {
      TestFuncs.userFindHook.call({}, ungroupedUserId, selector2, undefined);
    }, (e) => e.error === 403 && e.reason === ErrMsg.groupFindErr);

    // Grouped user — should add group filter
    const selector3 = {foo: "bar"};
    await Partitioner.bindUserGroup(userId, () => {
      TestFuncs.userFindHook.call({}, userId, selector3, undefined);
    });
    test.equal(selector3.foo, "bar");
    test.equal(selector3.group, testGroupId);
    test.equal(selector3.admin.$exists, false);
  });

  Meteor.userId = originalUserId;
})();
