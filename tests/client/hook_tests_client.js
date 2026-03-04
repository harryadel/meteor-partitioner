import { TestFuncs } from "meteor/mizzao:partitioner";
import { createTestUser } from "../utils.js";

const testGroupId = "test_group_client";

// In collection-hooks v2, before.find hooks receive (userId, selector, options)
// as direct parameters. Hooks mutate selector in place — no this.args.

// XXX All async here to ensure ordering
Tinytest.addAsync("partitioner - hooks - add client group", async (test) => {
  const userId = await createTestUser();
  const originalUserId = Meteor.userId;
  Meteor.userId = () => userId;

  try {
    await Meteor.callAsync("joinGroup", testGroupId);
  } catch (e) {
    test.fail("This should not throw an error");
  } finally {
    Meteor.userId = originalUserId;
  }

});

Tinytest.addAsync("partitioner - hooks - vanilla client find", async (test) => {
  // In v2, _getFindSelector returns {} for no-args find, so selector is always an object
  const selector = {};

  const userId = await createTestUser();

  TestFuncs.userFindHook.call({}, undefined, selector, undefined);
  // Should have nothing changed (no userId)
  test.isFalse(!!selector.admin);

  const selector2 = {};
  TestFuncs.userFindHook.call({}, userId, selector2, undefined);
  // Non-admin user — nothing changed
  test.isFalse(!!selector2.admin);
});

Tinytest.addAsync("partitioner - hooks - admin added in client find", async (test) => {
  const originalUserId = Meteor.userId;
  Meteor.userId = () => "fakeUserId";

  const originalUser = Meteor.user;
  Meteor.user = () => ({admin: true});

  try {
    // No userId — nothing changed
    const selector1 = {};
    TestFuncs.userFindHook.call({}, undefined, selector1, undefined);
    test.isFalse(!!selector1.admin);

    // With userId (admin user) — should add admin filter
    const selector2 = {};
    TestFuncs.userFindHook.call({}, Meteor.userId(), selector2, undefined);
    test.equal(selector2.admin.$exists, false);
  } finally {
    Meteor.user = originalUser;
    Meteor.userId = originalUserId;
  }
});

Tinytest.addAsync("partitioner - hooks - admin hidden in client find", async (test) => {
  const originalUserId = Meteor.userId;
  Meteor.userId = () => "fakeUserId";

  const originalUser = Meteor.user;
  Meteor.user = () => ({admin: true});

  try {
    const selector1 = {};
    TestFuncs.userFindHook.call({}, undefined, selector1, undefined);
    test.isFalse(!!selector1.admin);

    const selector2 = {};
    TestFuncs.userFindHook.call({}, Meteor.userId(), selector2, undefined);
    test.equal(selector2.admin.$exists, false);
  } finally {
    Meteor.user = originalUser;
    Meteor.userId = originalUserId;
  }
});

Tinytest.addAsync("partitioner - hooks - admin hidden in selector find", async (test) => {
  const originalUserId = Meteor.userId;
  Meteor.userId = () => "fakeUserId";

  // No userId — nothing changed
  const selector1 = {foo: "bar"};
  TestFuncs.userFindHook.call({}, undefined, selector1, undefined);
  test.equal(selector1.foo, "bar");
  test.isFalse(!!selector1.admin);

  const originalUser = Meteor.user;
  const originalIsDirect = Helpers.isDirectUserSelector;
  Meteor.user = () => ({admin: true});
  Helpers.isDirectUserSelector = () => false;

  try {
    // With admin userId — should add admin filter to existing selector
    const selector2 = {foo: "bar"};
    TestFuncs.userFindHook.call({}, Meteor.userId(), selector2, undefined);
    test.equal(selector2.foo, "bar");
    test.equal(selector2.admin.$exists, false);
  } finally {
    Meteor.user = originalUser;
    Helpers.isDirectUserSelector = originalIsDirect;
    Meteor.userId = originalUserId;
  }
});

// Need to remove admin to avoid fubars in other tests
Tinytest.addAsync("partitioner - hooks - unset admin", async (test) => {
  const userId = await createTestUser();
  const originalUserId = Meteor.userId;
  Meteor.userId = () => userId;

  try {
    await Meteor.callAsync("setAdmin", false);
  } catch (e) {
    test.fail("This should not throw an error");
  } finally {
    Meteor.userId = originalUserId;
  }

  test.isFalse(Meteor.user().admin);
});

Tinytest.addAsync("partitioner - hooks - set admin", async (test) => {
  const userId = await createTestUser();
  const originalUserId = Meteor.userId;
  Meteor.userId = () => userId;

  try {
    await Meteor.callAsync("setAdmin", true);
  } catch (e) {
    test.fail("This should not throw an error");
  } finally {
    Meteor.userId = originalUserId;
  }

  test.isTrue(Meteor.user().admin);
});
