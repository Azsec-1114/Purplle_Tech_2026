import httpx
import asyncio
import os
from datetime import datetime
from rich.live import Live
from rich.table import Table
from rich.layout import Layout
from rich.panel import Panel
from rich.console import Console
from rich.text import Text
from rich.progress_bar import ProgressBar
from rich.align import Align

API_URL = os.getenv("API_URL", "http://localhost:8000")
STORE_ID = os.getenv("STORE_ID", "STORE_BLR_002")
REFRESH_INTERVAL = 2  # seconds

def make_header(store_id: str, last_updated: str) -> Panel:
    text = Text(f"🏪 {store_id} — Apex Retail Intelligence", style="bold white", justify="center")
    text.append(f"\nStatus: LIVE 🟢  |  Last updated: {last_updated}", style="dim")
    return Panel(text, style="blue")

def make_metrics_panel(metrics: dict) -> Panel:
    table = Table(expand=True, show_edge=False)
    table.add_column("Metric", style="cyan")
    table.add_column("Value", justify="right")
    table.add_column("Status", justify="center")

    # Safe gets with fallbacks
    visitors = metrics.get("unique_visitors", 0)
    conv_rate = metrics.get("conversion_rate", 0.0)
    q_depth = metrics.get("queue_depth", 0)
    abandon = metrics.get("abandonment_rate", 0.0)
    confidence = metrics.get("data_confidence", "N/A")

    # Visitors Logic
    v_stat = "[yellow]Low[/]" if visitors == 0 else "[green]Normal[/]"
    table.add_row("Unique Visitors Today", str(visitors), v_stat)
    
    # Conversion Logic
    c_stat = "[red]Below Avg[/]" if conv_rate and conv_rate < 15 else "[green]Good[/]"
    table.add_row("Conversion Rate", f"{conv_rate}%", c_stat)
    
    # Queue Logic
    q_color = "red" if q_depth > 3 else "green"
    q_stat = f"[{q_color}]{'High' if q_depth > 3 else 'Normal'}[/]"
    table.add_row("Queue Depth", f"[{q_color}]{q_depth}[/]", q_stat)
    
    # Abandonment Logic
    a_stat = "[red]High[/]" if abandon > 10 else "[green]Normal[/]"
    table.add_row("Abandonment Rate", f"{abandon}%", a_stat)
    
    table.add_row("Data Confidence", str(confidence), "[blue]System[/]")

    return Panel(table, title="[bold]Store Metrics[/]", border_style="cyan")

def make_funnel_panel(funnel: list) -> Panel:
    table = Table(show_header=False, expand=True, box=None)
    table.add_column("Stage", style="magenta", width=15)
    table.add_column("Count", justify="right", width=5)
    table.add_column("Visual", style="dim")
    table.add_column("Drop-off", justify="right", width=10)

    if not funnel:
        return Panel("No funnel data available.", title="[bold]Conversion Funnel[/]")

    max_count = max([f.get("count", 0) for f in funnel]) if funnel else 1
    
    for row in funnel:
        stage = row.get("stage", "UNKNOWN")
        count = row.get("count", 0)
        drop = row.get("dropoff_pct", 0.0)
        
        # Calculate visual bar proportion
        blocks = int((count / max_count) * 20) if max_count > 0 else 0
        bar = "█" * blocks
        
        drop_str = f"↓{drop}%" if drop > 0 else ""
        table.add_row(stage, str(count), bar, f"[red]{drop_str}[/]" if drop > 0 else "")

    return Panel(table, title="[bold]Conversion Funnel[/]", border_style="magenta")

def make_heatmap_panel(heatmap: list) -> Panel:
    table = Table(show_header=False, expand=True, box=None)
    table.add_column("Zone", style="yellow", width=15)
    table.add_column("Avg Dwell", width=15)
    table.add_column("Activity Bar")

    if not heatmap:
        return Panel("No heatmap data available.", title="[bold]Zone Heatmap[/]")

    for row in heatmap:
        zone = row.get("zone_id", "Unknown")
        dwell = row.get("avg_dwell_seconds", 0)
        score = row.get("normalised_score", 0)
        
        # Color based on score
        color = "green"
        if score > 33: color = "yellow"
        if score > 66: color = "red"
        
        blocks = int((score / 100) * 40)
        bar = f"[{color}]" + ("█" * blocks) + "[/]"
        
        table.add_row(zone, f"{dwell}s", bar)

    return Panel(table, title="[bold]Zone Heatmap[/]", border_style="yellow")

def make_anomalies_panel(anomalies: list) -> Panel:
    if not anomalies:
        return Panel("[green]✅ No active anomalies. Operations normal.[/green]", title="[bold]Active Anomalies[/]")

    text = Text()
    for idx, a in enumerate(anomalies):
        sev = a.get("severity", "INFO")
        typ = a.get("type", "UNKNOWN_ANOMALY")
        msg = a.get("message", "")
        
        if sev == "CRITICAL":
            text.append(f"🔴 [bold red]{typ}[/]\n   {msg}\n", style="red")
        elif sev == "WARN":
            text.append(f"⚠️ [bold yellow]{typ}[/]\n   {msg}\n", style="yellow")
        else:
            text.append(f"ℹ️ [bold blue]{typ}[/]\n   {msg}\n", style="blue")
            
    return Panel(text, title="[bold]Active Anomalies[/]", border_style="red")

async def fetch_all_data(client: httpx.AsyncClient) -> tuple:
    """Fetch all metrics endpoints concurrently"""
    results = await asyncio.gather(
        client.get(f"{API_URL}/stores/{STORE_ID}/metrics"),
        client.get(f"{API_URL}/stores/{STORE_ID}/funnel"),
        client.get(f"{API_URL}/stores/{STORE_ID}/heatmap"),
        client.get(f"{API_URL}/stores/{STORE_ID}/anomalies"),
        return_exceptions=True
    )
    return results

def build_layout(metrics, funnel, heatmap, anomalies, last_updated) -> Layout:
    layout = Layout()
    layout.split_column(
        Layout(make_header(STORE_ID, last_updated), name="header", size=3),
        Layout(name="middle", size=10),
        Layout(make_heatmap_panel(heatmap), name="heatmap", size=8),
        Layout(make_anomalies_panel(anomalies), name="anomalies", size=8)
    )
    layout["middle"].split_row(
        Layout(make_metrics_panel(metrics), name="metrics"),
        Layout(make_funnel_panel(funnel), name="funnel")
    )
    return layout

async def main():
    console = Console()
    async with httpx.AsyncClient(timeout=5.0) as client:
        with Live(console=console, refresh_per_second=1, screen=True) as live:
            while True:
                try:
                    results = await fetch_all_data(client)
                    
                    # Extract JSON, guarding against exceptions
                    def parse_result(res, default):
                        if isinstance(res, Exception) or res.status_code != 200:
                            return default
                        return res.json()
                        
                    metrics = parse_result(results[0], {})
                    funnel = parse_result(results[1], [])
                    heatmap = parse_result(results[2], [])
                    anomalies = parse_result(results[3], [])
                    
                    last_updated = datetime.utcnow().strftime("%H:%M:%S UTC")
                    
                    layout = build_layout(metrics, funnel, heatmap, anomalies, last_updated)
                    live.update(layout)
                except Exception as e:
                    live.update(Panel(f"[red]Dashboard Error: Connection Lost.\n{e}[/red]", title="System Fault"))
                
                await asyncio.sleep(REFRESH_INTERVAL)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nExiting Terminal Dashboard.")