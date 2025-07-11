# My Graph Note Title

This is some regular Markdown content that can exist alongside the graph visualization. We can describe the graph, provide context, or just write notes.

## Graph Definition

Below is the embedded graph data.

```json_graph
{
  "nodes": [
    {
      "id": "node1",
      "label": "Concept A",
      "x": 50,
      "y": 50,
      "content": "This is **Concept A**. It's central to many ideas.",
      "shape": "box",
      "color": { "background": "#lightblue", "border": "blue" }
    },
    {
      "id": "node2",
      "label": "Concept B\n(Multiline)",
      "x": 250,
      "y": 150,
      "content": "### Concept B Details\n- Point 1\n- Point 2",
      "shape": "ellipse"
    },
    {
      "id": "node3",
      "label": "Linked Note",
      "x": 50,
      "y": 250,
      "link": "[[another_note.md]]",
      "shape": "database",
      "color": { "background": "lightgreen" }
    },
    {
      "id": "node4",
      "label": "Simple Node",
      "x": -150,
      "y": 100
    }
  ],
  "edges": [
    {
      "from": "node1",
      "to": "node2",
      "label": "relates to",
      "arrows": "to"
    },
    {
      "from": "node1",
      "to": "node3",
      "label": "links to",
      "arrows": "to",
      "dashes": true
    },
    {
      "from": "node2",
      "to": "node4",
      "label": "influences"
    },
    {
      "from": "node4",
      "to": "node1",
      "label": "feedback loop",
      "arrows": "to, from"
    }
  ]
}
```

## More Markdown Content

This content appears after the graph data block. It should still be rendered as part of the note.

- Item 1
- Item 2

That's all for this sample graph note.
