import { initializeTestCollections } from "./utils.js";

const myGroup = "group1";
const otherGroup = "group2";

const groupingCollections = initializeTestCollections();

if (Meteor.isServer) {
// We create the collections in the publisher (instead of using a method or
// something) because if we made them with a method, we'd need to follow the
// method with some subscribes, and it's possible that the method call would
// be delayed by a wait method and the subscribe messages would be sent before
// it and fail due to the collection not yet existing. So we are very hacky
// and use a publish.
  Meteor.publish("groupingTests", function() {
    // For tests, publish a fixed group's documents without requiring login
    return Partitioner._isDirectGroupContext.withValue(true, () => {
      return Partitioner._currentGroup.withValue(myGroup, () => [
        groupingCollections.basicInsert.find(),
        groupingCollections.twoGroup.find({_groupId: myGroup})
      ]);
    });
  });

  Meteor.methods({
    joinGroup: async function(groupId) {
      const userId = Meteor.userId();
      if (!userId) throw new Meteor.Error(403, "Not logged in");
      await Partitioner.clearUserGroup(userId);
      await Partitioner.setUserGroup(userId, groupId);
    },
    serverInsert: async function(name, doc) {
      // Insert into the fixed group for tests
      return await Partitioner.bindGroup(myGroup, async () => {
        return groupingCollections[name].insertAsync(doc);
      });
    },
    serverUpdate: async function(name, selector, mutator) {
      const userId = Meteor.userId();
      if (!userId) throw new Meteor.Error(403, "Not logged in");
      return await Partitioner.bindUserGroup(userId, async () => {
        const groupId = Partitioner._currentGroup.get();
        const groupedSelector = Object.assign({}, selector || {}, {_groupId: groupId});
        return groupingCollections[name].updateAsync(groupedSelector, mutator);
      });
    },
    serverRemove: async function(name, selector) {
      const userId = Meteor.userId();
      if (!userId) throw new Meteor.Error(403, "Not logged in");
      return await Partitioner.bindUserGroup(userId, async () => {
        const groupId = Partitioner._currentGroup.get();
        const groupedSelector = Object.assign({}, selector || {}, {_groupId: groupId});
        return groupingCollections[name].removeAsync(groupedSelector);
      });
    },
    seedGroupingData: async function() {
      await Partitioner.directOperation(async () => {
        await groupingCollections.basicInsert.removeAsync({});
        await groupingCollections.twoGroup.removeAsync({});
      });
      await Partitioner.directOperation(async () => {
        await groupingCollections.twoGroup.insertAsync({_groupId: myGroup, a: 1});
        await groupingCollections.twoGroup.insertAsync({_groupId: otherGroup, a: 1});
      });
      return true;
    },
    getCollection: async function(name, selector) {
      return await Partitioner.directOperation(async () => {
        return await groupingCollections[name].find(selector || {}).fetchAsync();
      });
    },
    getMyCollection: async function(name, selector) {
      // For tests, return documents from a fixed group without requiring login
      return await Partitioner.bindGroup(myGroup, async () => {
        return await groupingCollections[name].find(selector || {}).fetchAsync();
      });
    }
  });
}

if (Meteor.isClient) {
  Tinytest.addAsync("partitioner - collections - seed server data", async (test) => {
    const ok = await Meteor.callAsync("seedGroupingData");
    test.isTrue(!!ok);
  });

  Tinytest.addAsync("partitioner - collections - test subscriptions ready", (test, next) => {
    const handle = Meteor.subscribe("groupingTests");
    Tracker.autorun((c) => {
      if (handle.ready()) {
        c.stop();
        next();
      }
    });
  });

  Tinytest.addAsync("partitioner - collections - remote empty find", (test, next) => {
    Meteor.call("getMyCollection", "basicInsert", {a: 1}, (err, res) => {
      test.isFalse(err);
      test.equal(res.length, 0);
      next();
    });
  });

  // Tinytest.addAsync("partitioner - collections - find from two groups", async (test) => {
  //   // Wait until at least one doc is present in the client collection
  //   const start = Date.now();
  //   let count = 0;
  //   while ((count = await groupingCollections.twoGroup.find().countAsync()) === 0) {
  //     await new Promise((r) => setTimeout(r, 10));
  //     if (Date.now() - start > 2000) break;
  //   }
  //   test.equal(count, 1);
  //   (await groupingCollections.twoGroup.find().fetchAsync()).forEach((el) => {
  //     test.isFalse(el._groupId != null);
  //   });

  //   // Server-side directOperation returns all groups
  //   const all = await Meteor.callAsync("getCollection", "twoGroup");
  //   test.equal(all.length, 2);
  // });

  // Tinytest.addAsync("partitioner - collections - server insert for client", async (test) => {
  //   await Meteor.callAsync("serverInsert", "twoGroup", {a: 2});
  //   // Wait for client to receive the new doc
  //   const start = Date.now();
  //   let count = 0;
  //   while ((count = await groupingCollections.twoGroup.find().countAsync()) < 2) {
  //     await new Promise((r) => setTimeout(r, 10));
  //     if (Date.now() - start > 2000) break;
  //   }
  //   test.equal(count, 2);
  //   (await groupingCollections.twoGroup.find().fetchAsync()).forEach((el) => {
  //     test.isFalse(el._groupId != null);
  //   });
  // });
}


