import { TestFuncs } from "meteor/mizzao:partitioner";
import { createTestUser } from "../utils.js";

const testGroupId = "test_group_client";


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
  const ctx = {
    args: []
  };

  const userId = await createTestUser();

  TestFuncs.userFindHook.call(ctx, undefined, ctx.args[0], ctx.args[1]);
  // Should have nothing changed
  test.length(ctx.args, 0);

  TestFuncs.userFindHook.call(ctx, userId, ctx.args[0], ctx.args[1]);
  // Also nothing changed
  test.length(ctx.args, 0);
});

Tinytest.addAsync("partitioner - hooks - admin added in client find", async (test) => {
  const ctx = {
    args: []
  };

  const originalUserId = Meteor.userId;
  Meteor.userId = () => "fakeUserId";

  const originalUser = Meteor.user;
  Meteor.user = () => ({admin: true});

  TestFuncs.userFindHook.call(ctx, undefined, ctx.args[0], ctx.args[1]);
  // Should have nothing changed
  test.length(ctx.args, 0);

  TestFuncs.userFindHook.call(ctx, Meteor.userId(), ctx.args[0], ctx.args[1]);
  // Admin removed from find
  test.equal(ctx.args[0].admin.$exists, false);

  Meteor.user = originalUser;
  Meteor.userId = originalUserId;
});

Tinytest.addAsync("partitioner - hooks - admin hidden in client find", async (test) => {
  const ctx = {
    args: []
  };

  const originalUserId = Meteor.userId;
  Meteor.userId = () => "fakeUserId";

  const originalUser = Meteor.user;
  Meteor.user = () => ({admin: true});

  try {
    TestFuncs.userFindHook.call(ctx, undefined, ctx.args[0], ctx.args[1]);
    // Should have nothing changed
    test.length(ctx.args, 0);

    TestFuncs.userFindHook.call(ctx, Meteor.userId(), ctx.args[0], ctx.args[1]);
    // Admin removed from find
    test.equal(ctx.args[0].admin.$exists, false);
  } finally {
    Meteor.user = originalUser;
    Meteor.userId = originalUserId;
  }
});

Tinytest.addAsync("partitioner - hooks - admin hidden in selector find", async (test) => {
  const ctx = {
    args: [{foo: "bar"}]
  };

  const originalUserId = Meteor.userId;
  Meteor.userId = () => "fakeUserId";

  TestFuncs.userFindHook.call(ctx, undefined, ctx.args[0], ctx.args[1]);
  // Should have nothing changed
  test.length(ctx.args, 1);
  test.equal(ctx.args[0].foo, "bar");

  const originalUser = Meteor.user;
  const originalIsDirect = Helpers.isDirectUserSelector;
  Meteor.user = () => ({admin: true});
  Helpers.isDirectUserSelector = () => false;

  try {
    TestFuncs.userFindHook.call(ctx, Meteor.userId(), ctx.args[0], ctx.args[1]);
    // Admin removed from find
    test.equal(ctx.args[0].foo, "bar");
    test.equal(ctx.args[0].admin.$exists, false);
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