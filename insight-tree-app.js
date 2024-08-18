/* globals TomSelect */
import { dsvFormat } from "https://cdn.skypack.dev/d3-dsv@3";
import { scaleLinear } from "https://cdn.skypack.dev/d3-scale@4";
import { hcl } from "https://cdn.skypack.dev/d3-color@3";
import {
  insightTree,
  LEVEL,
  RANK,
  GROUP,
  IMPACT,
  SURPRISE,
} from "https://cdn.jsdelivr.net/npm/@gramex/insighttree@3/dist/insighttree.js";
import { num, pc } from "https://cdn.jsdelivr.net/npm/@gramex/ui/dist/format.js";

const $data = document.querySelector("#data");
const $slider = document.querySelector("#slider");
const $showDeepInsights = document.querySelector("#show-deep-insights");
let pauseRenderTree = false;

// Clicking a page tab updates the hash
document.querySelector("body").addEventListener("shown.bs.tab", (event) => {
  location.hash = event.target.href.split("#").at(-1);
});

// Render application based on URL state
function render() {
  // Select a page tab from hash path
  let [path] = location.hash.replace(/^#/, "").split("?");
  document.querySelector(".page-tabs").querySelector(`[href="#${path}"]`)?.click();
}
window.addEventListener("hashchange", render);

/** Set #data textarea value and trigger a change event (which doesn't happen by default) */
function setData(value) {
  $data.value = value || "";
  $data.dispatchEvent(new Event("change"));
}

// Uploading a file renders its contents in #data
document.querySelector(".file-upload").addEventListener("change", (event) => {
  const reader = new FileReader();
  reader.onload = (e) => setData(e.target.result);
  reader.readAsText(event.target.files[0]);
});

// Selecting a dataset renders its contents in #data
document.querySelector(".file-select").addEventListener("change", async (event) => {
  if (!event.target.value) return;
  const response = await fetch(event.target.value);
  setData(await response.text());
});

// Based on #data value, show/hide the preview tab
$data.addEventListener("change", (event) => {
  const value = event.target.value;
  document.querySelector("#no-data").classList.toggle("d-none", !!value);
  document.querySelector("#insight-tree-container").classList.toggle("d-none", !value);
});

const groupsSelect = new TomSelect("#groups", { selectOnTab: true });
const metricsSelect = new TomSelect("#metrics", { selectOnTab: true });
const impactSelect = new TomSelect("#impact", { selectOnTab: true });
const sortbySelect = new TomSelect("#sortby", { selectOnTab: true });
let tree, data;

// When #data value changes, parse the data
$data.addEventListener("change", (event) => {
  pauseRenderTree = true;
  // If the first line contains a tab, assume it's a TSV. Otherwise, assume it's a CSV.
  const firstLine = event.target.value.split("\n")[0];
  const format = dsvFormat(firstLine.includes("\t") ? "\t" : ",");
  data = format.parse(event.target.value);

  // Identify groups (non-numeric columns) and metrics (numeric columns) from the first 100 rows
  data.groups = [];
  data.metrics = [];
  data.columns.forEach((column) => {
    if (data.slice(0, 100).every((row) => !isNaN(row[column]))) data.metrics.push(column);
    else data.groups.push(column);
  });

  // Update the groups and metrics select boxes
  for (const [select, values] of [
    [groupsSelect, data.groups],
    [metricsSelect, data.metrics],
  ]) {
    select.clear();
    select.clearOptions();
    select.addOption(values.map((val) => ({ value: val, text: val })));
    select.setValue(values);
  }
  for (const select of [impactSelect, sortbySelect]) {
    select.clear();
    select.clearOptions();
    select.addOption(data.metrics.map((val) => ({ value: val, text: val })));
    select.setValue(data.metrics.at(-1));
  }
  pauseRenderTree = false;
  renderTree();
});

document.querySelector("#insight-tree-controls").addEventListener("change", renderTree);

function renderTree() {
  if (pauseRenderTree) return;
  const impact = impactSelect.getValue();
  const sortBy = sortbySelect.getValue();
  const impactDescending = document.querySelector("#impact-descending").checked;
  const sortByDescending = document.querySelector("#sortby-descending").checked;
  tree = insightTree(".insight-tree", {
    data: data,
    groups: groupsSelect.getValue(),
    metrics: metricsSelect.getValue(),
    impact: impactDescending ? `-${impact}` : impact,
    sort: `${sortByDescending ? "-" : "+"}${sortBy}`,
    render: insightTreeRender,
    extra: [impact, impactDescending],
  });
  updateTreeSlider();
}

function updateTreeSlider() {
  if ($showDeepInsights.checked) tree.update({ rank: +$slider.value }, { leaf: true });
  else tree.update({ rank: +$slider.value });
}

$slider.addEventListener("input", updateTreeSlider);

const insightTreeRender = (el, { tree, metrics }) => {
  const impact = impactSelect.getValue();
  const impactDescending = document.querySelector("#impact-descending").checked;
  const impactValues = tree.map((d) => d[impact]).sort();
  const color = scaleLinear()
    .domain([Math.min(...impactValues), impactValues[Math.floor(impactValues.length / 2)], Math.max(...impactValues)])
    .range(impactDescending ? ["green", "yellow", "red"] : ["red", "yellow", "green"]);
  el.innerHTML = /* html */ `
  <table class="table table-sm w-auto">
    <thead>
      <tr>
        <th></th>
        <th>Group</th>
        ${metrics
          .map(
            (metric) => /* html */ `
          <th class="text-end ${metric == impact ? "bg-warning" : ""}">${metric}</th>
        `
          )
          .join("")}
          <th title="How unusual or hard is it to find this insight?">surprise</th>
          <th title="How much does this impact the ranked metric?">impact</th>
      </tr>
    </thead>
    <tbody>
      ${tree
        .map(
          (rest) => /* html */ `
        <tr data-insight-level="${rest[LEVEL]}" data-insight-rank="${rest[RANK]}">
          <td class="text-end">#${rest[RANK]}</th>
          <td style="padding-left:${rest[LEVEL] * 1.5}rem">
            <span class="insight-toggle"></span> ${rest[GROUP]}
          </td>
          ${metrics
            .map((metric) => {
              const val = rest[metric];
              let style = "";
              if (metric == impact) {
                const bg = color(val);
                const fg = hcl(bg).l > 55 ? "black" : "white";
                style = `style="background-color:${bg};color:${fg}"`;
              }
              return /* html */ `<td class="text-end" ${style}>${num(val)}</td>`;
            })
            .join("")}
            <td class="text-end small text-secondary">${pc(rest[SURPRISE])}</td>
            <td class="text-end small text-secondary">${pc(rest[IMPACT])}</td>
        </tr>`
        )
        .join("")}
    </tbody>
  </table>`;
};

// Always start with #data
location.hash = "#data";
