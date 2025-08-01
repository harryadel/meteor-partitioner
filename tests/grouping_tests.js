const myGroup = "group1";
const otherGroup = "group2";
const treatmentName = "baz";

const basicInsertCollection = new Mongo.Collection("basicInsert");
const twoGroupCollection = new Mongo.Collection("twoGroup");

/*
  Set up server and client hooks
*/
let hookCollection;

if (Meteor.isServer) {
  const groupingCollections = {};

  groupingCollections.basicInsert = basicInsertCollection;
  groupingCollections.twoGroup = twoGroupCollection;

  hookCollection = (collection) => {
    collection._insecure = true;
    // Attach the hooks to the collection
    Partitioner.partitionCollection(collection);
  };
}

if (Meteor.isClient) {
  const hookCollection = (collection) => Partitioner.partitionCollection(collection);
}

/*
  Hook collections and run tests
*/
console.log("BASIC INSERT COLLECTION: ", basicInsertCollection);
hookCollection(basicInsertCollection);
hookCollection(twoGroupCollection);

if (Meteor.isServer) {

  // We create the collections in the publisher (instead of using a method or
  // something) because if we made them with a method, we'd need to follow the
  // method with some subscribes, and it's possible that the method call would
  // be delayed by a wait method and the subscribe messages would be sent before
  // it and fail due to the collection not yet existing. So we are very hacky
  // and use a publish.
  Meteor.publish("groupingTests", async function() {
    if (!this.userId) return;

    Partitioner.directOperation(async () => {
      await basicInsertCollection.removeAsync({});
      await twoGroupCollection.removeAsync({});
    });

    const cursors = [basicInsertCollection.find(), twoGroupCollection.find()];

    Meteor._debug("grouping publication activated");

    Partitioner.directOperation(async () => {
      await twoGroupCollection.insertAsync({
        _groupId: myGroup,
        a: 1
      });

      await twoGroupCollection.insertAsync({
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
      Partitioner.setUserGroup(userId, myGroup);
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
      return Partitioner.directOperation(async () => await groupingCollections[name].find(selector || {}).fetchAsync());
    },
    getMyCollection: async function(name, selector) {
      return await groupingCollections[name].find(selector).fetchAsync();
    },
    printCollection: async function(name) {
      console.log(await Partitioner.directOperation(async () => await groupingCollections[name].find().fetchAsync()));
    },
    printMyCollection: async function(name) {
      console.log(await groupingCollections[name].find().fetchAsync());
    }
  });

  Tinytest.add("partitioner - grouping - undefined default group", (test) => {
    test.equal(Partitioner.group(), undefined);
  });

  // The overriding is done separately for hooks
  Tinytest.add("partitioner - grouping - override group environment variable", (test) => {
    Partitioner.bindGroup("overridden", () => {
      test.equal(Partitioner.group(), "overridden");
    });
  });

  Tinytest.add("partitioner - collections - disallow arbitrary insert", (test) => {
    test.throws(async () => {
      await basicInsertCollection.insertAsync({foo: "bar"});
    }, (e) => e.error === 403 && e.reason === ErrMsg.userIdErr);
  });

  Tinytest.add("partitioner - collections - insert with overridden group", (test) => {
    Partitioner.bindGroup("overridden", async () => {
      await basicInsertCollection.insertAsync({foo: "bar"});
      test.ok();
    });
  });
}

if (Meteor.isClient) {
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

  Tinytest.addAsync("partitioner - collections - test subscriptions ready", (test, next) => {
    const handle = Meteor.subscribe("groupingTests");
    Tracker.autorun((c) => {
      if (handle.ready()) {
        c.stop();
        next();
      }
    });
  });

  Tinytest.addAsync("partitioner - collections - local empty find", async (test, next) => {
    test.equal(await basicInsertCollection.find().countAsync(), 0);
    test.equal(await basicInsertCollection.find({}).countAsync(), 0);
    next();
  });

  Tinytest.addAsync("partitioner - collections - remote empty find", (test, next) => {
    Meteor.call("getMyCollection", "basicInsert", {a: 1}, (err, res) => {
      test.isFalse(err);
      test.equal(res.length, 0);
      next();
    });
  });

  testAsyncMulti("partitioner - collections - basic insert", [
    (test, expect) => {
      const id = basicInsertCollection.insertAsync({a: 1}, expect((err, res) => {
        test.isFalse(err, JSON.stringify(err));
        test.equal(res, id);
      }));
    },
    async (test, expect) => {
      test.equal(await basicInsertCollection.find({a: 1}).countAsync(), 1);
      test.isFalse((await basicInsertCollection.findOneAsync({a: 1}))._groupId != null);
    }
  ]);

  testAsyncMulti("partitioner - collections - find from two groups", [
    async (test, expect) => {
      test.equal(await twoGroupCollection.find().countAsync(), 1);

      (await twoGroupCollection.find().fetchAsync()).forEach((el) => {
        test.isFalse(el._groupId != null);
      });

      Meteor.call("getCollection", "twoGroup", expect((err, res) => {
        test.isFalse(err);
        test.equal(res.length, 2);
      }));
    }
  ]);

  testAsyncMulti("partitioner - collections - insert into two groups", [
    async (test, expect) => {
      twoGroupCollection.insert({a: 2}, expect(async (err) => {
        test.isFalse(err, JSON.stringify(err));
        test.equal(await twoGroupCollection.find().countAsync(), 2);

        (await twoGroupCollection.find().fetchAsync()).forEach((el) => {
          test.isFalse(el._groupId != null);
        });
      }));
      /*
        twoGroup now contains
        { _groupId: "myGroup", a: 1 }
        { _groupId: "myGroup", a: 2 }
        { _groupId: "otherGroup", a: 1 }
      */
    },
    (test, expect) => {
      Meteor.call("getMyCollection", "twoGroup", expect((err, res) => {
        test.isFalse(err);
        test.equal(res.length, 2);

        // Method finds should also not return _groupId
        res.forEach((el) => {
          test.isFalse(el._groupId != null);
        });
      }));
    },
    (test, expect) => { // Ensure that the other half is still on the server
      Meteor.call("getCollection", "twoGroup", expect((err, res) => {
        test.isFalse(err, JSON.stringify(err));
        test.equal(res.length, 3);
      }));
    }
  ]);

  testAsyncMulti("partitioner - collections - server insert for client", [
    (test, expect) => {
      Meteor.call("serverInsert", "twoGroup", {a: 3}, expect((err, res) => {
        test.isFalse(err);
      }));
      /*
        twoGroup now contains
        { _groupId: "myGroup", a: 1 }
        { _groupId: "myGroup", a: 2 }
        { _groupId: "myGroup", a: 3 }
        { _groupId: "otherGroup", a: 1 }
      */
    },
    (test, expect) => {
      Meteor.call("getMyCollection", "twoGroup", {}, expect((err, res) => {
        test.isFalse(err);
        test.equal(res.length, 3);

        res.forEach((el) => {
          test.isFalse(el._groupId != null);
        });
      }));
    }
  ]);

  testAsyncMulti("partitioner - collections - server update identical keys across groups", [
    (test, expect) => {
      Meteor.call("serverUpdate", "twoGroup",
        {a: 1},
        {$set: {b: 1}}, expect((err, res) => {
          test.isFalse(err);
        }));
      /*
        twoGroup now contains
        { _groupId: "myGroup", a: 1, b: 1 }
        { _groupId: "myGroup", a: 2 }
        { _groupId: "myGroup", a: 3 }
        { _groupId: "otherGroup", a: 1 }
      */
    },
    (test, expect) => { // Make sure that the other group's record didn't get updated
      Meteor.call("getCollection", "twoGroup", expect((err, res) => {
        test.isFalse(err);
        res.forEach((doc) => {
          if (doc.a === 1 && doc._groupId === myGroup) {
            test.equal(doc.b, 1);
          } else {
            test.isFalse(doc.b);
          }
        });
      }));
    }
  ]);

  testAsyncMulti("partitioner - collections - server remove identical keys across groups", [
    (test, expect) => {
      Meteor.call("serverRemove", "twoGroup",
        {a: 1}, expect((err, res) => {
          test.isFalse(err);
        }));
    },
    (test, expect) => { // Make sure that the other group's record didn't get updated
      Meteor.call("getCollection", "twoGroup", {a: 1}, expect((err, res) => {
        test.isFalse(err);
        test.equal(res.length, 1);
        test.equal(res[0].a, 1);
      }));
    }
  ]);
} 