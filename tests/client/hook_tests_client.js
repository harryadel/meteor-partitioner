// import { TestFuncs } from "meteor/mizzao:partitioner";
// import { createTestUser } from "../utils.js";

// const testGroupId = "test_group_client";


// // XXX All async here to ensure ordering
// Tinytest.addAsync("partitioner - hooks - add client group", async (test) => {
//   const userId = await createTestUser();
//   const originalUserId = Meteor.userId;
//   Meteor.userId = () => userId;
  
//   try {
//     await Meteor.callAsync("joinGroup", testGroupId);
//   } catch (e) {
//     test.fail("This should not throw an error"); 
//   } finally {
//     Meteor.userId = originalUserId;
//   }

// });

// Tinytest.addAsync("partitioner - hooks - vanilla client find", async (test) => {
//   const ctx = {
//     args: []
//   };

//   const userId = await createTestUser();

//   TestFuncs.userFindHook.call(ctx, undefined, ctx.args[0], ctx.args[1]);
//   // Should have nothing changed
//   test.length(ctx.args, 0);

//   TestFuncs.userFindHook.call(ctx, userId, ctx.args[0], ctx.args[1]);
//   // Also nothing changed
//   test.length(ctx.args, 0);
// });

// Tinytest.add("partitioner - hooks - set admin", (test) => {
//   Meteor.call("setAdmin", true, (err, res) => {
//     test.isFalse(err);
//     test.isTrue(Meteor.users.findOne(Meteor.userId()).admin);
//   });
// });

// // Tinytest.addAsync("partitioner - hooks - admin hidden in client find", (test, next) => {
// //   const ctx = {
// //     args: []
// //   };

// //   TestFuncs.userFindHook.call(ctx, undefined, ctx.args[0], ctx.args[1]);
// //   // Should have nothing changed
// //   test.length(ctx.args, 0);

// //   TestFuncs.userFindHook.call(ctx, Meteor.userId(), ctx.args[0], ctx.args[1]);
// //   // Admin removed from find
// //   test.equal(ctx.args[0].admin.$exists, false);
// //   next();
// // });

// // Tinytest.addAsync("partitioner - hooks - admin hidden in selector find", (test, next) => {
// //   const ctx = {
// //     args: [{foo: "bar"}]
// //   };

// //   TestFuncs.userFindHook.call(ctx, undefined, ctx.args[0], ctx.args[1]);
// //   // Should have nothing changed
// //   test.length(ctx.args, 1);
// //   test.equal(ctx.args[0].foo, "bar");

// //   TestFuncs.userFindHook.call(ctx, Meteor.userId(), ctx.args[0], ctx.args[1]);
// //   // Admin removed from find
// //   test.equal(ctx.args[0].foo, "bar");
// //   test.equal(ctx.args[0].admin.$exists, false);
// //   next();
// // });

// // Need to remove admin to avoid fubars in other tests
// // Tinytest.addAsync("partitioner - hooks - unset admin", async (test, next) => {
// //   Meteor.call("setAdmin", false, (err, res) => {
// //     test.isFalse(err);
// //     test.isFalse(Meteor.user().admin);
// //     next();
// //   });
// // });
