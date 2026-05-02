import fs from 'node:fs/promises'
import path from 'node:path'

import { BrowserWindow, dialog } from 'electron'

import type { ExportFormat, ExportResult } from '../shared/export'

type Options = {
  resultsRoot: string
  runsRoot: string
  exportsRoot: string
  getMainWindow: () => BrowserWindow | null
  getRendererDevUrl: () => string | null
  getRendererIndexFile: () => string
  preloadPath: string
}

const isSafeRunId = (v: string) => /^[A-Za-z0-9._-]{1,120}$/.test(v)

const defaultName = (runId: string, format: ExportFormat) => {
  if (format === 'markdown') return `${runId}.md`
  if (format === 'json') return `${runId}.json`
  return `${runId}.pdf`
}

export const createExportManager = (opts: Options) => {
  const pickPath = async (format: ExportFormat, runId: string): Promise<string | null> => {
    const win = opts.getMainWindow()
    const options = {
      defaultPath: path.join(opts.exportsRoot, defaultName(runId, format)),
      filters:
        format === 'pdf'
          ? [{ name: 'PDF', extensions: ['pdf'] }]
          : format === 'json'
            ? [{ name: 'JSON', extensions: ['json'] }]
            : [{ name: 'Markdown', extensions: ['md'] }],
    }
    const res = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
    if (res.canceled || !res.filePath) return null
    return res.filePath
  }

  const exportMarkdown = async (runId: string): Promise<ExportResult> => {
    if (!isSafeRunId(runId)) return { ok: false, error: 'bad_run_id' }
    const dest = await pickPath('markdown', runId)
    if (!dest) return { ok: false, error: 'canceled' }
    try {
      const src = path.join(opts.runsRoot, runId, 'mvp_report.md')
      const md = await fs.readFile(src, 'utf-8')
      await fs.mkdir(path.dirname(dest), { recursive: true })
      await fs.writeFile(dest, md, 'utf-8')
      return { ok: true, path: dest }
    } catch (e) {
      return { ok: false, error: `export_markdown_failed:${String(e)}` }
    }
  }

  const exportJson = async (runId: string): Promise<ExportResult> => {
    if (!isSafeRunId(runId)) return { ok: false, error: 'bad_run_id' }
    const dest = await pickPath('json', runId)
    if (!dest) return { ok: false, error: 'canceled' }
    try {
      const src = path.join(opts.runsRoot, runId, 'meta.json')
      const json = await fs.readFile(src, 'utf-8')
      await fs.mkdir(path.dirname(dest), { recursive: true })
      await fs.writeFile(dest, json, 'utf-8')
      return { ok: true, path: dest }
    } catch (e) {
      return { ok: false, error: `export_json_failed:${String(e)}` }
    }
  }

  const exportPdf = async (runId: string): Promise<ExportResult> => {
    if (!isSafeRunId(runId)) return { ok: false, error: 'bad_run_id' }
    const dest = await pickPath('pdf', runId)
    if (!dest) return { ok: false, error: 'canceled' }

    const win = new BrowserWindow({
      show: false,
      width: 1200,
      height: 900,
      webPreferences: {
        preload: opts.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
      },
    })

    try {
      const devUrl = opts.getRendererDevUrl()
      if (devUrl) {
        await win.loadURL(`${devUrl}?print=1&runId=${encodeURIComponent(runId)}`)
      } else {
        await win.loadFile(opts.getRendererIndexFile(), { query: { print: '1', runId } })
      }

      await new Promise<void>((resolve) => setTimeout(() => resolve(), 300))

      const pdf = await win.webContents.printToPDF({
        printBackground: true,
        pageSize: 'A4',
        margins: { marginType: 'custom', top: 38, bottom: 38, left: 38, right: 38 },
      })
      await fs.mkdir(path.dirname(dest), { recursive: true })
      await fs.writeFile(dest, pdf)
      return { ok: true, path: dest }
    } catch (e) {
      return { ok: false, error: `export_pdf_failed:${String(e)}` }
    } finally {
      try {
        win.destroy()
      } catch {
        // ignore
      }
    }
  }

  const exportFile = async (runId: string, format: ExportFormat): Promise<ExportResult> => {
    if (format === 'markdown') return exportMarkdown(runId)
    if (format === 'json') return exportJson(runId)
    return exportPdf(runId)
  }

  return { exportFile }
}
