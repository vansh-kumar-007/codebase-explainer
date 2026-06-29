// components/DependencyGraph.tsx
// Renders an interactive force-directed graph using D3.
// Nodes = files. Edges = import relationships.
// Users can drag nodes, zoom, and pan.

"use client";

import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { DependencyGraph as DependencyGraphType } from "@/lib/types";

interface Props {
  graph: DependencyGraphType;
  selectedFile?: string | null;
}

// Color each node by programming language
const LANGUAGE_COLORS: Record<string, string> = {
  typescript: "#3178c6",
  javascript: "#f7df1e",
  python: "#3572A5",
  go: "#00ADD8",
  rust: "#dea584",
  java: "#b07219",
  markdown: "#6b7280",
  json: "#9ca3af",
  default: "#6b7280",
};

export default function DependencyGraph({ graph, selectedFile }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  // When selectedFile changes, highlight that node
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);

    // Reset all nodes to their original color
    svg.selectAll("circle")
      .attr("stroke", (d: any) => d.isEntryPoint ? "#fbbf24" : "#1f2937")
      .attr("stroke-width", (d: any) => d.isEntryPoint ? 3 : 1.5)
      .attr("opacity", selectedFile ? 0.4 : 1);

    // Highlight the selected node
    if (selectedFile) {
      svg.selectAll("circle")
        .filter((d: any) => d.id === selectedFile)
        .attr("stroke", "#fbbf24")
        .attr("stroke-width", 4)
        .attr("opacity", 1);
    }
  }, [selectedFile]);

  useEffect(() => {
    if (!svgRef.current || graph.nodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    // Clear any previous render
    svg.selectAll("*").remove();

    // ── Zoom behavior ─────────────────────────────────────────────
    // Allows users to scroll to zoom and drag to pan
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        container.attr("transform", event.transform);
      });

    svg.call(zoom);

    // Container group that zoom/pan will transform
    const container = svg.append("g");

    // ── Arrow marker for directed edges ───────────────────────────
    svg.append("defs").append("marker")
      .attr("id", "arrowhead")
      .attr("viewBox", "-0 -5 10 10")
      .attr("refX", 20)
      .attr("refY", 0)
      .attr("orient", "auto")
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .append("path")
      .attr("d", "M 0,-5 L 10 ,0 L 0,5")
      .attr("fill", "#4b5563");

    // ── Force simulation ──────────────────────────────────────────
    // D3 force simulation automatically positions nodes so they
    // don't overlap and connected nodes are pulled together.
    const simulation = d3.forceSimulation(graph.nodes as any)
      .force("link", d3.forceLink(graph.edges)
        .id((d: any) => d.id)
        .distance(120)        // preferred edge length
      )
      .force("charge", d3.forceManyBody().strength(-300))  // repulsion
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide(40));  // prevent overlap

    // ── Draw edges ────────────────────────────────────────────────
    const link = container.append("g")
      .selectAll("line")
      .data(graph.edges)
      .join("line")
      .attr("stroke", "#374151")
      .attr("stroke-width", 1.5)
      .attr("marker-end", "url(#arrowhead)");

    // ── Draw nodes ────────────────────────────────────────────────
    const node = container.append("g")
      .selectAll("g")
      .data(graph.nodes)
      .join("g")
      .attr("cursor", "pointer");

    // Node circle
    node.append("circle")
      .attr("r", (d) => d.isEntryPoint ? 14 : 9)
      .attr("fill", (d) => LANGUAGE_COLORS[d.language] || LANGUAGE_COLORS.default)
      .attr("stroke", (d) => d.isEntryPoint ? "#fbbf24" : "#1f2937")
      .attr("stroke-width", (d) => d.isEntryPoint ? 3 : 1.5);

    // Node label
    node.append("text")
      .text((d) => d.label)
      .attr("x", 0)
      .attr("y", 22)
      .attr("text-anchor", "middle")
      .attr("fill", "#9ca3af")
      .attr("font-size", "10px")
      .attr("font-family", "monospace");

    // ── Drag behavior ─────────────────────────────────────────────
    const drag = d3.drag<SVGGElement, any>()
      .on("start", (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on("end", (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });

    (node as any).call(drag);

    // ── Update positions on each simulation tick ──────────────────
    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      node.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
    });

    // Cleanup when component unmounts
    return () => {
      simulation.stop();
    };
  }, [graph]);

  return (
    <div className="w-full h-full bg-gray-950 rounded-xl border border-gray-800">
      {graph.nodes.length === 0 ? (
        <div className="flex items-center justify-center h-full text-gray-500">
          No dependency graph available
        </div>
      ) : (
        <>
          {/* Legend */}
          <div className="absolute bottom-3 left-3 flex flex-wrap gap-2 z-10">
            {Object.entries(LANGUAGE_COLORS)
              .filter(([lang]) => lang !== "default")
              .filter(([lang]) =>
                graph.nodes.some((n) => n.language === lang)
              )
              .map(([lang, color]) => (
                <div key={lang} className="flex items-center gap-1">
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-gray-400 text-xs">{lang}</span>
                </div>
              ))}
          </div>
          <svg
            ref={svgRef}
            className="w-full h-full"
          />
        </>
      )}
    </div>
  );
}