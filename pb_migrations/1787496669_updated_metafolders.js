/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("4tbmgriokvgheu2")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "mrjoql5b",
    "name": "parentMetafolder",
    "type": "relation",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "collectionId": "4tbmgriokvgheu2",
      "cascadeDelete": false,
      "minSelect": null,
      "maxSelect": 1,
      "displayFields": null
    }
  }))

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("4tbmgriokvgheu2")

  // remove
  collection.schema.removeField("mrjoql5b")

  return dao.saveCollection(collection)
})
