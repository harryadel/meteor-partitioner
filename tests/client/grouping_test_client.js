import { initializeTestCollections } from "../utils.js";

const myGroup = "group1";

const groupingCollections = initializeTestCollections();

/*
These tests need to all async so they are in the right order
*/

Tinytest.addAsync("partitioner - collections - join group", (test, next) => {
  Meteor.call("joinGroup", myGroup, (err, res) => {
    test.isFalse(err);
    next();
  });
});

// Ensure that the group id has been recorded before subscribing
Tinytest.addAsync("partitioner - collections - received group id", (test, next) => {
  Tracker.autorun((c) => {
    const groupId = Partitioner.group();
    if (groupId) {
      c.stop();
      test.equal(groupId, myGroup);
      next();
    }
  });
});

// Tinytest.addAsync("partitioner - collections - test subscriptions ready", (test, next) => {
//   const handle = Meteor.subscribe("groupingTests");
//   Tracker.autorun((c) => {
//     if (handle.ready()) {
//       c.stop();
//       next();
//     }
//   });
// });

// Tinytest.addAsync("partitioner - collections - local empty find", async (test, next) => {
//   test.equal(await basicInsertCollection.find().countAsync(), 0);
//   test.equal(await basicInsertCollection.find({}).countAsync(), 0);
// });

// Tinytest.addAsync("partitioner - collections - remote empty find", (test, next) => {
//   Meteor.call("getMyCollection", "basicInsert", {a: 1}, (err, res) => {
//     test.isFalse(err);
//     test.equal(res.length, 0);
//     next();
//   });
// });

// testAsyncMulti("partitioner - collections - basic insert", [
//   (test, expect) => {
//     const id = basicInsertCollection.insertAsync({a: 1}, expect((err, res) => {
//       test.isFalse(err, JSON.stringify(err));
//       test.equal(res, id);
//     }));
//   },
//   async (test, expect) => {
//     test.equal(await basicInsertCollection.find({a: 1}).countAsync(), 1);
//     test.isFalse((await basicInsertCollection.findOneAsync({a: 1}))._groupId != null);
//   }
// ]);

// testAsyncMulti("partitioner - collections - find from two groups", [
//   async (test) => {
//     test.equal(await groupingCollections.twoGroup.find().countAsync(), 1);

//     (await groupingCollections.twoGroup.find().fetchAsync()).forEach((el) => {
//       test.isFalse(el._groupId != null);
//     });

//     const res = await Meteor.callAsync("getCollection", "twoGroup")
//     test.isFalse(res.error);
//     test.equal(res.length, 2);
//   }
// ]);

// testAsyncMulti("partitioner - collections - insert into two groups", [
//   async (test) => {
//     const res = await groupingCollections.twoGroup.insertAsync({a: 2})
//     test.isFalse(res.error);
//       test.equal(await groupingCollections.twoGroup.find().countAsync(), 2);

//       (await groupingCollections.twoGroup.find().fetchAsync()).forEach((el) => {
//         test.isFalse(el._groupId != null);
//       });
//     /*
//       twoGroup now contains
//       { _groupId: "myGroup", a: 1 }
//       { _groupId: "myGroup", a: 2 }
//       { _groupId: "otherGroup", a: 1 }
//     */
//   },
//   async (test) => {
//     const res = await Meteor.callAsync("getMyCollection", "twoGroup")
//     test.isFalse(res.error);
//     test.equal(res.length, 2);

//       // Method finds should also not return _groupId
//       res.forEach((el) => {
//       test.isFalse(el._groupId != null);
//     });
//   },
//   async (test) => { // Ensure that the other half is still on the server
//     const res = await Meteor.callAsync("getCollection", "twoGroup")
//     test.isFalse(res.error);
//     test.equal(res.length, 3);
//   }
// ]);

// testAsyncMulti("partitioner - collections - server insert for client", [
//   async (test) => {
//     const res = await Meteor.callAsync("serverInsert", "twoGroup", {a: 3})
//     test.isFalse(res.error);
//     /*
//       twoGroup now contains
//       { _groupId: "myGroup", a: 1 }
//       { _groupId: "myGroup", a: 2 }
//       { _groupId: "myGroup", a: 3 }
//       { _groupId: "otherGroup", a: 1 }
//     */
//   },
//   async (test) => {
//     const res = await Meteor.callAsync("getMyCollection", "twoGroup", {})
//     test.isFalse(res.error);
//     test.equal(res.length, 3);

//       res.forEach((el) => {
//         test.isFalse(el._groupId != null);
//       });
//   }
// ]);

// testAsyncMulti("partitioner - collections - server update identical keys across groups", [
//   async (test) => {
//     const res = await Meteor.callAsync("serverUpdate", "twoGroup",
//       {a: 1},
//       {$set: {b: 1}})
//     test.isFalse(res.error);
//     /*
//       twoGroup now contains
//       { _groupId: "myGroup", a: 1, b: 1 }
//       { _groupId: "myGroup", a: 2 }
//       { _groupId: "myGroup", a: 3 }
//       { _groupId: "otherGroup", a: 1 }
//     */
//   },
//   async (test) => { // Make sure that the other group's record didn't get updated
//     const res = await Meteor.callAsync("getCollection", "twoGroup")
//     test.isFalse(res.error);
//       res.forEach((doc) => {
//         if (doc.a === 1 && doc._groupId === myGroup) {
//           test.equal(doc.b, 1);
//         } else {
//           test.isFalse(doc.b);
//       }
//     });
//   }
// ]);

// testAsyncMulti("partitioner - collections - server remove identical keys across groups", [
//   async (test) => {
//     const res = await Meteor.callAsync("serverRemove", "twoGroup", {a: 1})
//     test.isFalse(res.error);
//   },
//   async (test) => { // Make sure that the other group's record didn't get updated
//     const res = await Meteor.callAsync("getCollection", "twoGroup", {a: 1});
//     test.equal(res.length, 1);
//     test.equal(res[0].a, 1);
//   }
// ]);
