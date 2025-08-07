import { createTestUser } from "../utils.js";
import { initializeTestCollections } from "../utils.js";

const groupingCollections = initializeTestCollections();

// We create the collections in the publisher (instead of using a method or
// something) because if we made them with a method, we'd need to follow the
// method with some subscribes, and it's possible that the method call would
// be delayed by a wait method and the subscribe messages would be sent before
// it and fail due to the collection not yet existing. So we are very hacky
// and use a publish.
Meteor.publish("groupingTests", async function() {
  if (!this.userId) return;

  await Partitioner.directOperation(async () => {
    await groupingCollections.basicInsert.removeAsync({});
    await groupingCollections.twoGroup.removeAsync({});
  });

  const cursors = [groupingCollections.basicInsert.find(), groupingCollections.twoGroup.find()];

  Meteor._debug("grouping publication activated");

  await Partitioner.directOperation(async () => {
    await groupingCollections.twoGroup.insertAsync({
      _groupId: myGroup,
      a: 1
    });

    await groupingCollections.twoGroup.insertAsync({
      _groupId: otherGroup,
      a: 1
    });
  });

  Meteor._debug("collections configured");

  return cursors;
});

Meteor.methods({
  joinGroup: async function(myGroup) {
    const userId = Meteor.userId();
    if (!userId) throw new Error(403, "Not logged in");
    await Partitioner.clearUserGroup(userId);
    await Partitioner.setUserGroup(userId, myGroup);
  },
  serverInsert: async function(name, doc) {
    return groupingCollections[name].insertAsync(doc);
  },
  serverUpdate: async function(name, selector, mutator) {
    return groupingCollections[name].updateAsync(selector, mutator);
  },
  serverRemove: async function(name, selector) {
    return groupingCollections[name].removeAsync(selector);
  },
  getCollection: async function(name, selector) {
    const result = await Partitioner.directOperation(async () => await groupingCollections[name].find(selector || {}).fetchAsync())
    return result;
  },
  getMyCollection: async function(name, selector) {
    return await groupingCollections[name].find(selector).fetchAsync();
  }
});

// Tinytest.addAsync("partitioner - collections - local empty find", async (test) => {
//   const userId = await createTestUser();
//   const originalUserId = Meteor.userId;
//   Meteor.userId = () => userId;

//   test.equal(await basicInsertCollection.find().countAsync(), 0);
//   test.equal(await basicInsertCollection.find({}).countAsync(), 0);

//   Meteor.userId = originalUserId;
// });


Tinytest.addAsync("partitioner - grouping - undefined default group", async (test) => {
  const groupResult = await Partitioner.group();
  test.equal(groupResult, undefined);
});

// The overriding is done separately for hooks
Tinytest.addAsync("partitioner - grouping - override group environment variable", async (test) => {
  Partitioner.bindGroup("overridden", async () => {
    test.equal(await Partitioner.group(), "overridden");
  });
});

Tinytest.addAsync("partitioner - collections - disallow arbitrary insert", async (test) => {
  try {
      await groupingCollections.basicInsert.insertAsync({foo: "bar"});
      test.fail("Expected insert to throw an error");
    } catch (error) {
      test.equal(error.error, 403);
      test.equal(error.reason, ErrMsg.userIdErr);
    }
});

Tinytest.addAsync("partitioner - collections - insert with overridden group", async (test) => {
  await Partitioner.bindGroup("overridden", async () => {
    await groupingCollections.basicInsert.insertAsync({foo: "bar"});
    const result = await groupingCollections.basicInsert.find({foo: "bar"}).fetchAsync();
    test.equal(result.length, 1);
    test.equal(result[0]._groupId, "overridden");
  });
});