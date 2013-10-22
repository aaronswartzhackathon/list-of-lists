var iui = iui || {};
(function(iui) {
    // Imported from interlace3

    function _gen_items(mapping, sortfn) {
        var out = [];
        for(var k in mapping) {
            out.push(mapping[k]);
        }
        if(sortfn) {
            out.sort(sortfn);
        }
        return out;
    }
    function _gen_keys(mapping, sortfn) {
        var out = [];
        for(var k in mapping) {
            out.push(k);
        }
        if(sortfn) {
            out.sort(sortfn);
        }
        return out;
    }


    iui.CollectionMap = function(collection, keyfn) {
        // Maintains a mapping of key -> [item], where keys are
        // returned by keyfn(item). A collection map is itself a
        // collection of keys -- items() returns a list of keys. get()
        // behaves a bit differently, and returns all of the items
        // within a key.
        this.keyfn = keyfn;

        this._mapping = {};     // key -> [item]
        this._revmapping = {};  // itemid -> [key] (for internal mgmt)

        CollectionWatcher.call(this, collection);
    };
    iui.CollectionMap.prototype = new CollectionWatcher;
    iui.CollectionMap.prototype._concat_kv = function(key, value) {
        // does *not* check if value already in key --that's a caller invariant
        this._mapping[key] = (this._mapping[key] || []).concat([value]);

        if(this._mapping[key].length === 1) {
            this.trigger("create", key);
        }
        else {
            this.trigger("change", key);
        }
    };
    iui.CollectionMap.prototype._remove_kv = function(key, value) {
        // sister to _concat_kv
        this._mapping[key].splice(this._mapping[key].indexOf(value), 1);
        if(this._mapping[key].length === 0) {
            delete this._mapping[key];
            this.trigger("delete", key);
        }
        else {
            this.trigger("change", key);
        }
    };
    iui.CollectionMap.prototype._create = function(obj) {
        var keys = this.keyfn(obj);
        this._revmapping[obj._id] = keys;
        var that = this;
        keys.forEach(function(key) {
            that._concat_kv(key, obj);
        });
    };
    iui.CollectionMap.prototype._change = function(obj) {
        var that = this;
        var newkeys = this.keyfn(obj);
        var oldkeys = this._revmapping[obj._id];

        // add new keys
        newkeys.forEach(function(key) {
            if(oldkeys.indexOf(key) < 0) {
                that._concat_kv(key, obj);
            }
        });

        // remove old keys
        oldkeys.forEach(function(key) {
            if(newkeys.indexOf(key) < 0) {
                that._remove_kv(key, obj);
            }
        });

        this._revmapping[obj._id] = newkeys;
    };
    iui.CollectionMap.prototype._delete = function(obj) {
        var that = this;
        this._revmapping[obj._id].forEach(function(key) {
            that._remove_kv(key, obj);
        });
        delete this._revmapping[obj._id];
    };
    iui.CollectionMap.prototype.items = function(sortfn) {
        return _gen_keys(this._mapping, sortfn);
    };
    iui.CollectionMap.prototype.get = function(key) {
        return this._mapping[key];
    };
    iui.CollectionSearch = function(collection) {
        // Prefix-matching search base

        // XXX: Similar in many ways to CollectionMap -- there could
        // be common code

        CollectionWatcher.call(this, collection);

        if(!collection) {
            return;
        }

        // Internally, store results as a hash map between two-letter
        // prefixes and a list of match dictionaries.
        this._hashmap = {};    // {xx: [{spec}]}
        // For ease of removal, keep a mapping from object to
        // substrings
        this._objmap = {};      // {obj._id: {xy: true, bz: true}}

        // initial ingest
        var that = this;
        collection.items().forEach(function(obj) {
            that._create(obj);
        });
    };
    iui.CollectionSearch.prototype = new CollectionWatcher;

    var KEY_BLACKLIST = {"_rev": true};

    iui.CollectionSearch.prototype.get_substrings = function(obj) {
        // Returns a list of match dictionaries,
        // [{str:, key:, wd_idx:, obj: }]
        var out = [];
        for(var key in obj) {
            if(key in KEY_BLACKLIST) {
                continue;
            }
            var val = obj[key];
            if(typeof val === "string") {
                val.toLowerCase().split(" ").forEach(function(wd, idx) {
                    wd = wd.replace( /[^a-z0-9@\.]/ , "");
                    out.push({str: wd, key: key, wd_idx: idx, obj: obj});
                });
            }
        }
        return out;
    };
    iui.CollectionSearch.prototype.matches = function(str) {
        // Returns a list of match dictionaries.
        str = str.toLowerCase(); // XXX: more regexp massaging, handle spaces, &c
        return (this._hashmap[str.slice(0,2)] || []).filter(function(spec) {
            return spec.str.indexOf(str) === 0;
        });
    };
    iui.CollectionSearch.prototype._add_match = function(spec) {
        // spec is of the sort returned by get_substrings
        this._hashmap[spec.str.slice(0,2)] = (this._hashmap[spec.str.slice(0,2)] || []).concat(spec);

        // Initialize objmap if necessary
        var obj = spec.obj;
        this._objmap[obj._id] = this._objmap[obj._id] || {};
        this._objmap[obj._id][spec.str.slice(0,2)] = true;
    };
    iui.CollectionSearch.prototype._remove_obj = function(obj) {

        for(var substr in this._objmap[obj._id]) {
            this._hashmap[substr] = this._hashmap[substr].filter(function(spec) {
                return spec.obj !== obj;
            });
        }
        delete this._objmap[obj._id];
    };
    iui.CollectionSearch.prototype._delete = function(obj) {
        this._remove_obj(obj);
    };
    iui.CollectionSearch.prototype._create = function(obj) {
        var that = this;
        this.get_substrings(obj).forEach(function(spec) {
            that._add_match(spec);
        });
    };
    iui.CollectionSearch.prototype._change = function(obj) {
        this._remove_obj(obj);
        var that = this;
        this.get_substrings(obj).forEach(function(spec) {
            that._add_match(spec);
        });
    };

    iui.SearchResultsCollection = function(collectionsearch) {
        // track the *parent* of the search
        CollectionWatcher.call(this, collectionsearch.collection);
        // but keep the search around for queries
        this.search = collectionsearch;

        this._str = "";         // current search filter

        // initialize to full collection
        this._results = {};     // id -> {spec}
        var that = this;
        this._reset();
    };
    iui.SearchResultsCollection.prototype = new CollectionWatcher;
    iui.SearchResultsCollection.prototype._reset = function() {
        var that = this;
        this.collection.items().forEach(function(obj) {
            if(!(obj._id in that._results)) {
                that._results[obj._id] = {obj: obj};
                that.trigger("create", that._results[obj._id]);
            }
        });
    };
    iui.SearchResultsCollection.prototype.setSearch = function(str) {
        this._str = str;
        if(str.length >= 2) {
            this._merge_results(this.search.matches(str));
        }
        else {
            // XXX: super slow at first building up one-by-one (?)
            this._reset();
        }
    };
    iui.SearchResultsCollection.prototype._merge_results = function(res) {
        var matchdict = {};
        var that = this;
        // add new
        res.forEach(function(spec) {
            matchdict[spec.obj._id] = spec;

            if(!(spec.obj._id in that._results)) {
                that._results[spec.obj._id] = spec;
                that.trigger("create", spec);
            }
            else if(spec !== that._results[spec.obj._id]) {
                that._results[spec.obj._id] = spec;
                that.trigger("change", spec);
            }
        });
        // remove old
        for(var objid in this._results) {
            if(!(objid in matchdict)) {
                this.trigger("delete", this._results[objid]);
                delete this._results[objid];
            }
        }
    };
    iui.SearchResultsCollection.prototype.items = function(sortfn) {
        return _gen_items(this._results, sortfn);
    };
    iui.SearchResultsCollection.prototype.get = function(id) {
        return this._results[id];
    };

    // For now, re-run search query when documents are added or changed.
    // Would of course be more efficient just to look at the new doc.
    iui.SearchResultsCollection.prototype._create = function(obj) {
        this.setSearch(this._str);
    };
    iui.SearchResultsCollection.prototype._change = function(obj) {
        this.setSearch(this._str);
    };
    iui.SearchResultsCollection.prototype._delete = function(obj) {
        this.setSearch(this._str);
    };
})(iui);
