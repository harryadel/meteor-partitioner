import { createTestUser, createTestUserWithGroup } from "../utils.js";

const testUsername = "test_user";
const testGroupId = "test_group_server";


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

  Tinytest.addAsync("partitioner - hooks - find with no args", async (test) => {
    const ctx = {
      args: []
    };

    const userId = await createTestUserWithGroup(testUsername, testGroupId);

    Partitioner.bindGroup(testGroupId, () => {
      TestFuncs.findHook.call(ctx, userId, ctx.args[0], ctx.args[1]);
    });
    // Should replace undefined with { _groupId: ... }
    test.isTrue(ctx.args[0] != null);
    test.equal(ctx.args[0]._groupId, testGroupId);

    test.isTrue(ctx.args[1] != null);
    test.equal(ctx.args[1].fields._groupId, 0);
  });

  Tinytest.addAsync("partitioner - hooks - find with no group", async (test) => {
    const ctx = {
      args: []
    };

    const userId = await createTestUserWithGroup(testUsername, testGroupId);

    // Should throw if user is not logged in
    test.throws(() => {
      TestFuncs.findHook.call(ctx, undefined, ctx.args[0], ctx.args[1]);
    }, (e) => e.error === 403 && e.reason === ErrMsg.userIdErr);
  });

  Tinytest.addAsync("partitioner - hooks - find with string id", async (test) => {
    const ctx = {
      args: ["yabbadabbadoo"]
    };
    const userId = await createTestUserWithGroup(testUsername, testGroupId);

    TestFuncs.findHook.call(ctx, userId, ctx.args[0], ctx.args[1]);
    // Should not touch a string
    test.equal(ctx.args[0], "yabbadabbadoo");

    test.isFalse(ctx.args[1] != null);
  });

  Tinytest.addAsync("partitioner - hooks - find with single _id", async (test) => {
    const ctx = {
      args: [{_id: "yabbadabbadoo"}]
    };
    const userId = await createTestUserWithGroup(testUsername, testGroupId);

    TestFuncs.findHook.call(ctx, userId, ctx.args[0], ctx.args[1]);
    // Should not touch an object with _id
    test.equal(ctx.args[0]._id, "yabbadabbadoo");
    test.isFalse(ctx.args[0]._groupId);

    test.isFalse(ctx.args[1] != null);
  });

  Tinytest.addAsync("partitioner - hooks - find with complex _id", async (test) => {
    const ctx = {
      args: [{_id: {$ne: "yabbadabbadoo"}}]
    };
    const userId = await createTestUserWithGroup(testUsername, testGroupId);

    Partitioner.bindGroup(testGroupId, () => {
      TestFuncs.findHook.call(ctx, userId, ctx.args[0], ctx.args[1]);
    });
    // Should modify for complex _id
    test.equal(ctx.args[0]._id.$ne, "yabbadabbadoo");
    test.equal(ctx.args[0]._groupId, testGroupId);

    test.isTrue(ctx.args[1] != null);
    test.equal(ctx.args[1].fields._groupId, 0);
  });

  Tinytest.addAsync("partitioner - hooks - find with selector", async (test) => {
    const ctx = {
      args: [{foo: "bar"}]
    };

    const userId = await createTestUserWithGroup(testUsername, testGroupId);

    Partitioner.bindGroup(testGroupId, () => {
      TestFuncs.findHook.call(ctx, userId, ctx.args[0], ctx.args[1]);
    });
    test.equal(ctx.args[0].foo, "bar");
    test.equal(ctx.args[0]._groupId, testGroupId);

    test.isTrue(ctx.args[1] != null);
    test.equal(ctx.args[1].fields._groupId, 0);
  });

  Tinytest.addAsync("partitioner - hooks - find with inclusion fields", async (test) => {
    const ctx = {
      args: [
        {foo: "bar"},
        {fields: {foo: 1}}
      ]
    };

    const userId = await createTestUserWithGroup(testUsername, testGroupId);

    Partitioner.bindGroup(testGroupId, () => {
      TestFuncs.findHook.call(ctx, userId, ctx.args[0], ctx.args[1]);
    });
    // Should not touch a string
    test.equal(ctx.args[0].foo, "bar");
    test.equal(ctx.args[0]._groupId, testGroupId);

    test.isTrue(ctx.args[1] != null);
    test.equal(ctx.args[1].fields.foo, 1);
    test.isFalse(ctx.args[1].fields._groupId != null);
  });

  Tinytest.addAsync("partitioner - hooks - find with exclusion fields", async (test) => {
    const ctx = {
      args: [
        {foo: "bar"},
        {fields: {foo: 0}}
      ]
    };

    const userId = await createTestUserWithGroup(testUsername, testGroupId);

    Partitioner.bindGroup(testGroupId, () => {
      TestFuncs.findHook.call(ctx, userId, ctx.args[0], ctx.args[1]);
    });
    // Should not touch a string
    test.equal(ctx.args[0].foo, "bar");
    test.equal(ctx.args[0]._groupId, testGroupId);

    test.isTrue(ctx.args[1] != null);
    test.equal(ctx.args[1].fields.foo, 0);
    test.equal(ctx.args[1].fields._groupId, 0);
  });

  Tinytest.addAsync("partitioner - hooks - insert doc", async (test) => {
    const ctx = {
      args: [{foo: "bar"}]
    };
    const userId = await createTestUserWithGroup(testUsername, testGroupId);

    await TestFuncs.insertHook.call(ctx, userId, ctx.args[0]);
  
    test.equal(ctx.args[0].foo, "bar");
    test.equal(ctx.args[0]._groupId, testGroupId);
  });

  Tinytest.addAsync("partitioner - hooks - user find with no args", async (test) => {
    const ctx = {
      args: []
    };

    const userId = await createTestUserWithGroup(testUsername, testGroupId);
    const ungroupedUserId = await createTestUser();

    await Partitioner.bindUserGroup(userId, () => {
      TestFuncs.userFindHook.call(ctx, undefined, ctx.args[0], ctx.args[1]);
    });

    // Should have nothing changed
    test.length(ctx.args, 0);

    // Ungrouped user should throw an error
    test.throws(() => {
        TestFuncs.userFindHook.call(ctx, ungroupedUserId, ctx.args[0], ctx.args[1]);
    }, (e) => e.error === 403 && e.reason === ErrMsg.groupFindErr);

    await Partitioner.bindUserGroup(userId, () => {
      TestFuncs.userFindHook.call(ctx, userId, ctx.args[0], ctx.args[1]);
    });

    // Should replace undefined with { _groupId: ... }
    test.equal(ctx.args[0].group, testGroupId);
    test.equal(ctx.args[0].admin.$exists, false);
  });

  Tinytest.addAsync("partitioner - hooks - user find with environment group but no userId", async (test) => {
    const ctx = {
      args: []
    };

    await Partitioner.bindGroup(testGroupId, () => {
      TestFuncs.userFindHook.call(ctx, undefined, ctx.args[0], ctx.args[1]);
    });
    // Should have set the extra arguments
    test.equal(ctx.args[0].group, testGroupId);
    test.equal(ctx.args[0].admin.$exists, false);
  });

  Tinytest.addAsync("partitioner - hooks - user find with string id", async (test) => {
    const ctx = {
      args: ["yabbadabbadoo"]
    };

    const userId = await createTestUserWithGroup(testUsername, testGroupId);

    TestFuncs.userFindHook.call(ctx, undefined, ctx.args[0], ctx.args[1]);
    // Should have nothing changed
    test.equal(ctx.args[0], "yabbadabbadoo");

    TestFuncs.userFindHook.call(ctx, userId, ctx.args[0], ctx.args[1]);
    // Should not touch a string
    test.equal(ctx.args[0], "yabbadabbadoo");
  });

  Tinytest.addAsync("partitioner - hooks - user find with single _id", async (test) => {
    const ctx = {
      args: [{_id: "yabbadabbadoo"}]
    };

    const userId = await createTestUserWithGroup(testUsername, testGroupId);

    Partitioner.bindUserGroup(userId, () => {
      TestFuncs.userFindHook.call(ctx, undefined, ctx.args[0], ctx.args[1]);
    });
    // Should have nothing changed
    test.equal(ctx.args[0]._id, "yabbadabbadoo");
    test.isFalse(ctx.args[0].group);

    Partitioner.bindUserGroup(userId, () => {
      TestFuncs.userFindHook.call(ctx, userId, ctx.args[0], ctx.args[1]);
    });
    // Should not touch a single object
    test.equal(ctx.args[0]._id, "yabbadabbadoo");
    test.isFalse(ctx.args[0].group);
  });

  Tinytest.addAsync("partitioner - hooks - user find with _id: $in", async (test) => {
    const ctx = {
      args: [{_id: {$in: ["yabbadabbadoo"]}}]
    };

    TestFuncs.userFindHook.call(ctx, undefined, ctx.args[0], ctx.args[1]);
    // Should have nothing changed
    test.equal(ctx.args[0]._id.$in[0], "yabbadabbadoo");
    test.isFalse(ctx.args[0].group);

    const userId = await createTestUserWithGroup(testUsername, testGroupId);

    TestFuncs.userFindHook.call(ctx, userId, ctx.args[0], ctx.args[1]);
    // Should not touch a single object
    test.equal(ctx.args[0]._id.$in[0], "yabbadabbadoo");
    test.isFalse(ctx.args[0].group);
  });

  Tinytest.addAsync("partitioner - hooks - user find with complex _id", async (test) => {
    const notInGroup = "not_in_group";
    const ctx = {
      args: [{_id: {$ne: notInGroup}}]
    };

    const userId = await createTestUserWithGroup(testUsername, testGroupId);
    const ungroupedUserId = await createTestUser();

    await Partitioner.bindUserGroup(userId, () => {
      TestFuncs.userFindHook.call(ctx, undefined, ctx.args[0], ctx.args[1]);
    });
    // Should have nothing changed
    test.equal(ctx.args[0]._id.$ne, notInGroup);
    test.isFalse(ctx.args[0].group);

    // Ungrouped user should throw an error
    test.throws(() => {
      TestFuncs.userFindHook.call(ctx, ungroupedUserId, ctx.args[0], ctx.args[1]);
      // we changed this test to throw groupFindErr instead of groupErr
      // as due to 3.0 compability where we would not be able to fetch the user asynchronously
      // and we would not be able to use the groupFindErr message
      // so we fail quickly and require proper context setup
    }, (e) => e.error === 403 && e.reason === ErrMsg.groupFindErr);

    await Partitioner.bindUserGroup(userId, () => {
      TestFuncs.userFindHook.call(ctx, userId, ctx.args[0], ctx.args[1]);
    });
    
    // Should be modified
    test.equal(ctx.args[0]._id.$ne, notInGroup);
    test.equal(ctx.args[0].group, testGroupId);
    test.equal(ctx.args[0].admin.$exists, false);
  });

  Tinytest.addAsync("partitioner - hooks - user find with username", async (test) => {
    const ctx = {
      args: [{username: "yabbadabbadoo"}]
    };

    const userId = await createTestUserWithGroup(testUsername, testGroupId);

    TestFuncs.userFindHook.call(ctx, undefined, ctx.args[0], ctx.args[1]);
    // Should have nothing changed
    test.equal(ctx.args[0].username, "yabbadabbadoo");
    test.isFalse(ctx.args[0].group);

    TestFuncs.userFindHook.call(ctx, userId, ctx.args[0], ctx.args[1]);
    // Should not touch a single object
    test.equal(ctx.args[0].username, "yabbadabbadoo");
    test.isFalse(ctx.args[0].group);
  });

  // Tinytest.addAsync("partitioner - hooks - user find with complex username", async (test) => {
  //   const ctx = {
  //     args: [{username: {$ne: "yabbadabbadoo"}}]
  //   };

  //   const userId = await createTestUserWithGroup(testUsername, testGroupId);
  //   const ungroupedUserId = await createTestUser();

  //   TestFuncs.userFindHook.call(ctx, undefined, ctx.args[0], ctx.args[1]);
    
  //   // Should have nothing changed
  //   test.equal(ctx.args[0].username.$ne, "yabbadabbadoo");
  //   test.isFalse(ctx.args[0].group);

  //   // Ungrouped user should throw an error
  //   test.throws(() => {
  //     TestFuncs.userFindHook.call(ctx, ungroupedUserId, ctx.args[0], ctx.args[1]);
  //   }, (e) => e.error === 403 && e.reason === ErrMsg.groupFindErr);

  //   Partitioner.bindUserGroup(userId, () => {
  //     TestFuncs.userFindHook.call(ctx, userId, ctx.args[0], ctx.args[1]);
  //   });
    
  //   // Should be modified
  //   test.equal(ctx.args[0].username.$ne, "yabbadabbadoo");
  //   test.equal(ctx.args[0].group, testGroupId);
  //   test.equal(ctx.args[0].admin.$exists, false);
  // });

  Tinytest.addAsync("partitioner - hooks - user find with selector", async (test) => {
    const ctx = {
      args: [{foo: "bar"}]
    };

    const userId = await createTestUserWithGroup(testUsername, testGroupId);
    const ungroupedUserId = await createTestUser();

    await Partitioner.bindUserGroup(userId, () => {
      TestFuncs.userFindHook.call(ctx, undefined, ctx.args[0], ctx.args[1]);
    });

    // Should have nothing changed
    test.equal(ctx.args[0].foo, "bar");
    test.isFalse(ctx.args[0].group);

    // Ungrouped user should throw an error
    test.throws(() => {
      TestFuncs.userFindHook.call(ctx, ungroupedUserId, ctx.args[0], ctx.args[1]);
    }, (e) => e.error === 403 && e.reason === ErrMsg.groupFindErr);

    await Partitioner.bindUserGroup(userId, () => {
      TestFuncs.userFindHook.call(ctx, userId, ctx.args[0], ctx.args[1]);
    });

    // Should modify the selector
    test.equal(ctx.args[0].foo, "bar");
    test.equal(ctx.args[0].group, testGroupId);
    test.equal(ctx.args[0].admin.$exists, false);
  });
  
  Meteor.userId = originalUserId;
})();