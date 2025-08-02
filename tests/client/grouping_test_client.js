// const myGroup = "group1";

// hookCollection = (collection) => Partitioner.partitionCollection(collection);

// /*
// These tests need to all async so they are in the right order
// */

// Tinytest.addAsync("partitioner - collections - join group", (test, next) => {
//   Meteor.call("joinGroup", myGroup, (err, res) => {
//     test.isFalse(err);
//     next();
//   });
// });

// // Ensure that the group id has been recorded before subscribing
// Tinytest.addAsync("partitioner - collections - received group id", (test, next) => {
//   Tracker.autorun((c) => {
//     const groupId = Partitioner.group();
//     if (groupId) {
//       c.stop();
//       test.equal(groupId, myGroup);
//       next();
//     }
//   });
// });

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
//   next();
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
//   async (test, expect) => {
//     test.equal(await twoGroupCollection.find().countAsync(), 1);

//     (await twoGroupCollection.find().fetchAsync()).forEach((el) => {
//       test.isFalse(el._groupId != null);
//     });

//     Meteor.call("getCollection", "twoGroup", expect((err, res) => {
//       test.isFalse(err);
//       test.equal(res.length, 2);
//     }));
//   }
// ]);

// testAsyncMulti("partitioner - collections - insert into two groups", [
//   async (test, expect) => {
//     twoGroupCollection.insert({a: 2}, expect(async (err) => {
//       test.isFalse(err, JSON.stringify(err));
//       test.equal(await twoGroupCollection.find().countAsync(), 2);

//       (await twoGroupCollection.find().fetchAsync()).forEach((el) => {
//         test.isFalse(el._groupId != null);
//       });
//     }));
//     /*
//       twoGroup now contains
//       { _groupId: "myGroup", a: 1 }
//       { _groupId: "myGroup", a: 2 }
//       { _groupId: "otherGroup", a: 1 }
//     */
//   },
//   (test, expect) => {
//     Meteor.call("getMyCollection", "twoGroup", expect((err, res) => {
//       test.isFalse(err);
//       test.equal(res.length, 2);

//       // Method finds should also not return _groupId
//       res.forEach((el) => {
//         test.isFalse(el._groupId != null);
//       });
//     }));
//   },
//   (test, expect) => { // Ensure that the other half is still on the server
//     Meteor.call("getCollection", "twoGroup", expect((err, res) => {
//       test.isFalse(err, JSON.stringify(err));
//       test.equal(res.length, 3);
//     }));
//   }
// ]);

// testAsyncMulti("partitioner - collections - server insert for client", [
//   (test, expect) => {
//     Meteor.call("serverInsert", "twoGroup", {a: 3}, expect((err, res) => {
//       test.isFalse(err);
//     }));
//     /*
//       twoGroup now contains
//       { _groupId: "myGroup", a: 1 }
//       { _groupId: "myGroup", a: 2 }
//       { _groupId: "myGroup", a: 3 }
//       { _groupId: "otherGroup", a: 1 }
//     */
//   },
//   (test, expect) => {
//     Meteor.call("getMyCollection", "twoGroup", {}, expect((err, res) => {
//       test.isFalse(err);
//       test.equal(res.length, 3);

//       res.forEach((el) => {
//         test.isFalse(el._groupId != null);
//       });
//     }));
//   }
// ]);

// testAsyncMulti("partitioner - collections - server update identical keys across groups", [
//   (test, expect) => {
//     Meteor.call("serverUpdate", "twoGroup",
//       {a: 1},
//       {$set: {b: 1}}, expect((err, res) => {
//         test.isFalse(err);
//       }));
//     /*
//       twoGroup now contains
//       { _groupId: "myGroup", a: 1, b: 1 }
//       { _groupId: "myGroup", a: 2 }
//       { _groupId: "myGroup", a: 3 }
//       { _groupId: "otherGroup", a: 1 }
//     */
//   },
//   (test, expect) => { // Make sure that the other group's record didn't get updated
//     Meteor.call("getCollection", "twoGroup", expect((err, res) => {
//       test.isFalse(err);
//       res.forEach((doc) => {
//         if (doc.a === 1 && doc._groupId === myGroup) {
//           test.equal(doc.b, 1);
//         } else {
//           test.isFalse(doc.b);
//         }
//       });
//     }));
//   }
// ]);

// testAsyncMulti("partitioner - collections - server remove identical keys across groups", [
//   (test, expect) => {
//     Meteor.call("serverRemove", "twoGroup",
//       {a: 1}, expect((err, res) => {
//         test.isFalse(err);
//       }));
//   },
//   (test, expect) => { // Make sure that the other group's record didn't get updated
//     Meteor.call("getCollection", "twoGroup", {a: 1}, expect((err, res) => {
//       test.isFalse(err);
//       test.equal(res.length, 1);
//       test.equal(res[0].a, 1);
//     }));
//   }
// ]);
