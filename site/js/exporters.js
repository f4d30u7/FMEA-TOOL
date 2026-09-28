(function () {
  'use strict';

  const STATUS_LABELS = {
    draft: 'Borrador',
    'in-review': 'En revisión',
    final: 'Final',
    archived: 'Archivado',
    replaced: 'Reemplazado',
    pending: 'Pendiente',
    evaluated: 'Evaluado',
    'action-open': 'Acción abierta',
    closed: 'Cerrado',
    proposed: 'Propuesta',
    accepted: 'Aceptada',
    'in-progress': 'En progreso',
    implemented: 'Implementada',
    'pending-verification': 'Pendiente de verificación',
    'effectiveness-verified': 'Efectividad verificada',
    cancelled: 'Cancelada',
    replaced: 'Reemplazada',
    'requires-action': 'Requiere acción',
    'accepted-currently': 'Aceptado actualmente',
    'accepted-with-justification': 'Aceptado con justificación',
    'accepted-temporarily': 'Aceptado temporalmente',
    'closed-after-action': 'Cerrado después de acción',
    'not-applicable': 'No aplica'
  };

  const NODE_LABELS = {
    start: 'Inicio',
    end: 'Fin',
    operation: 'Operación',
    inspection: 'Inspección / control',
    decision: 'Decisión',
    transport: 'Transporte',
    storage: 'Almacenamiento',
    wait: 'Espera',
    external: 'Proceso externo',
    rework: 'Retrabajo',
    subprocess: 'Subproceso'
  };

  const textEncoder = new TextEncoder();

  function escXml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&apos;');
  }

  function escHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function statusLabel(value) {
    return STATUS_LABELS[value] || String(value || '');
  }

  function safeFilename(value) {
    return String(value || 'PFMEA')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  function safeSpreadsheetText(value) {
    let text = String(value ?? '');
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return text;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 700);
  }

  function cell(value, style = 0) {
    return { value, style };
  }

  function titleRow(text) {
    return [cell(text, 2)];
  }

  function sectionRow(text) {
    return [cell(text, 3)];
  }

  function headerRow(values) {
    return values.map((value) => cell(value, 1));
  }

  function riskContexts(project) {
    return project.risks
      .filter((risk) => risk.status !== 'archived')
      .map((risk) => {
        const context = PFMEA_MODEL.riskContext(project, risk);
        return { risk, ...context, fn: context.function, governingEffect: context.effect };
      })
      .filter((item) => item.cause && item.failureMode)
      .sort((a, b) => {
        const orderA = Number(a.stage?.analysisOrder || 999999);
        const orderB = Number(b.stage?.analysisOrder || 999999);
        return orderA - orderB || String(a.risk.code).localeCompare(String(b.risk.code));
      });
  }

  function controlsFor(project, item, type) {
    const causeId = item.cause?.id;
    const failureModeId = item.failureMode?.id;
    const stageId = item.stage?.id;
    const ids = project.controlLinks
      .filter((link) => {
        const targetMatch = (causeId && link.causeId === causeId)
          || (failureModeId && link.failureModeId === failureModeId)
          || (stageId && link.stageId === stageId);
        if (!targetMatch) return false;
        if (type === 'preventive') return link.relationship === 'prevents';
        if (type === 'detection') return ['detects', 'monitors'].includes(link.relationship);
        return true;
      })
      .map((link) => link.controlId);
    return project.controls.filter((control) => ids.includes(control.id) && control.status !== 'retired');
  }

  function reactionsFor(project, item) {
    const causeId = item.cause?.id;
    const controlIds = controlsFor(project, item).map((control) => control.id);
    return project.reactionPlans.filter((plan) =>
      plan.linkedCauseIds?.includes(causeId) || plan.linkedControlIds?.some((id) => controlIds.includes(id))
    );
  }

  function actionsFor(project, risk) {
    const ids = new Set([...(risk.actionIds || [])]);
    project.actions.forEach((action) => {
      if (action.linkedRiskIds?.includes(risk.id)) ids.add(action.id);
    });
    return project.actions.filter((action) => ids.has(action.id));
  }

  function effectsFor(project, failureModeId) {
    return project.effects.filter((effect) => effect.failureModeId === failureModeId && effect.active !== false);
  }

  function joined(values, separator = '\n') {
    return values.filter((value) => String(value ?? '').trim()).join(separator);
  }

  function formatIsoDate(value) {
    if (!value) return '';
    const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('es-AR', { dateStyle: 'short' }).format(date);
  }

  function basicIssues(project) {
    const issues = [];
    const activeStages = project.processMap.nodes.filter((node) => !node.archived && !['start', 'end'].includes(node.type));
    activeStages.forEach((stage) => {
      const functions = project.functions.filter((fn) => fn.stageId === stage.id && fn.status !== 'archived');
      if (!functions.length && project.workflow.stageStatus?.[stage.id] !== 'not-applicable') {
        issues.push(['Etapa', `${stage.code} · ${stage.name}`, 'Sin resultado esperado o función definida']);
      }
    });
    project.failureModes.filter((mode) => mode.status === 'active').forEach((mode) => {
      if (!project.effects.some((effect) => effect.failureModeId === mode.id && effect.active !== false)) {
        issues.push(['Modo de falla', mode.description, 'Sin efecto activo']);
      }
      if (!project.causes.some((cause) => cause.failureModeId === mode.id && cause.status === 'active')) {
        issues.push(['Modo de falla', mode.description, 'Sin causa activa']);
      }
    });
    riskContexts(project).forEach((item) => {
      const current = item.risk.current || {};
      if (![current.severity, current.occurrence, current.detection].every((value) => Number.isInteger(value))) {
        issues.push(['Riesgo', item.risk.code, 'Evaluación G/O/D incompleta']);
      }
      if (item.risk.decision === 'pending') issues.push(['Riesgo', item.risk.code, 'Sin decisión']);
      const preventive = controlsFor(project, item, 'preventive');
      const detection = controlsFor(project, item, 'detection');
      if (!preventive.length && !item.cause.controlAbsence?.preventiveConfirmed) {
        issues.push(['Riesgo', item.risk.code, 'Sin control preventivo ni confirmación de ausencia']);
      }
      if (!detection.length && !item.cause.controlAbsence?.detectionConfirmed) {
        issues.push(['Riesgo', item.risk.code, 'Sin control de detección ni confirmación de ausencia']);
      }
    });
    project.actions.forEach((action) => {
      if (['cancelled', 'effectiveness-verified', 'replaced'].includes(action.status)) return;
      if (!action.responsible) issues.push(['Acción', action.code, 'Sin responsable']);
      if (!action.targetDate) issues.push(['Acción', action.code, 'Sin fecha objetivo']);
    });
    return issues;
  }

  function summarySheet(project) {
    const metrics = PFMEA_MODEL.projectMetrics(project);
    const rows = [
      titleRow('PFMEA Flow · Resumen del proyecto'),
      [cell('Generado', 3), formatIsoDate(new Date().toISOString())],
      sectionRow('Identificación'),
      ['Proyecto', project.metadata.name],
      ['Código', project.metadata.code],
      ['Revisión', project.metadata.revision],
      ['Estado', statusLabel(project.metadata.status)],
      ['Proceso', project.metadata.processName],
      ['Producto / familia', project.metadata.productFamily],
      ['Sitio', project.metadata.site],
      ['Área / línea', project.metadata.areaLine],
      ['Responsable', project.metadata.owner],
      ['Fecha de inicio', formatIsoDate(project.metadata.startDate)],
      ['Fecha objetivo', formatIsoDate(project.metadata.targetDate)],
      [],
      sectionRow('Indicadores'),
      headerRow(['Indicador', 'Valor']),
      ['Etapas analizadas', `${metrics.completedStages} / ${metrics.stages}`],
      ['Riesgos', metrics.risks],
      ['RPN máximo', metrics.maxRpn],
      ['Riesgos prioritarios', metrics.criticalRisks],
      ['Acciones abiertas', metrics.openActions],
      ['Acciones vencidas', metrics.overdueActions],
      ['Avance estimado', `${metrics.totalProgress}%`],
      [],
      sectionRow('Alcance'),
      ['Objetivo', project.scope.objective],
      ['Inicio del proceso', project.scope.processStart],
      ['Fin del proceso', project.scope.processEnd],
      ['Productos incluidos', project.scope.includedProducts],
      ['Exclusiones', project.scope.exclusions],
      ['Supuestos', project.scope.assumptions],
      ['Interfaces', project.scope.interfaces],
      ['Procesos externos', project.scope.externalProcesses],
      ['Restricciones', project.scope.constraints],
      [],
      sectionRow('Equipo PFMEA'),
      headerRow(['Nombre', 'Rol', 'Área', 'Especialidad']),
      ...project.team.map((member) => [member.name, member.role, member.area, member.specialty])
    ];
    return { name: '00 Resumen', rows, widths: [24, 80, 24, 32], freezeRows: 0 };
  }

  function processSheet(project) {
    const activeNodes = project.processMap.nodes
      .filter((node) => !node.archived)
      .sort((a, b) => Number(a.analysisOrder || 0) - Number(b.analysisOrder || 0));
    const rows = [
      headerRow(['Código', 'Etapa', 'Tipo', 'Descripción', 'Área', 'Responsable', 'Entradas', 'Salidas', 'Orden', 'Estado del análisis']),
      ...activeNodes.map((node) => [
        node.code,
        node.name,
        NODE_LABELS[node.type] || node.type,
        node.description,
        node.area,
        node.responsible,
        joined(node.inputs || []),
        joined(node.outputs || []),
        node.analysisOrder,
        statusLabel(project.workflow.stageStatus?.[node.id])
      ])
    ];
    return { name: '01 Proceso', rows, widths: [12, 30, 20, 45, 20, 24, 36, 36, 10, 22], freezeRows: 1, autoFilter: true };
  }

  const PFMEA_HEADERS = [
    'ID riesgo', 'Código etapa', 'Etapa', 'Tipo de etapa', 'Resultado esperado / función', 'Requisito',
    'Característica especial', 'Modo de falla', 'Efectos potenciales', 'Efecto gobernante', 'G', 'Justificación G',
    'Causa potencial', 'Categoría de causa', 'O', 'Justificación O', 'Controles preventivos actuales',
    'Controles de detección actuales', 'D', 'Justificación D', 'RPN actual', 'Plan de reacción', 'Decisión',
    'Justificación de aceptación', 'Acciones', 'Responsables', 'Fechas objetivo', 'Estados de acción',
    'G objetivo', 'O objetivo', 'D objetivo', 'RPN objetivo', 'G residual', 'O residual', 'D residual',
    'RPN residual', 'Verificación de efectividad', 'Comentarios'
  ];

  function pfmeaDataRows(project) {
    return riskContexts(project).map((item) => {
      const { risk, stage, fn, failureMode, cause, governingEffect } = item;
      const effects = effectsFor(project, failureMode.id);
      const preventive = controlsFor(project, item, 'preventive');
      const detection = controlsFor(project, item, 'detection');
      const reactions = reactionsFor(project, item);
      const actions = actionsFor(project, risk);
      const scIds = new Set([...(fn?.specialCharacteristicIds || []), ...(governingEffect?.specialCharacteristicIds || [])]);
      const sc = project.methodology.specialCharacteristics
        .filter((itemSc) => scIds.has(itemSc.id))
        .map((itemSc) => itemSc.code || itemSc.label);
      return [
        risk.code,
        stage?.code || '',
        stage?.name || '',
        NODE_LABELS[stage?.type] || stage?.type || '',
        fn?.description || '',
        fn?.requirement || fn?.specification || '',
        joined(sc, ', '),
        failureMode?.description || '',
        joined(effects.map((effect) => `${effect.level ? `[${effect.level}] ` : ''}${effect.description}`)),
        governingEffect?.description || '',
        risk.current?.severity,
        risk.current?.severityRationale || governingEffect?.severityRationale || '',
        cause?.description || '',
        cause?.category || '',
        risk.current?.occurrence,
        risk.current?.occurrenceRationale || '',
        joined(preventive.map((control) => `${control.code ? `${control.code}: ` : ''}${control.description}`)),
        joined(detection.map((control) => `${control.code ? `${control.code}: ` : ''}${control.description}`)),
        risk.current?.detection,
        risk.current?.detectionRationale || '',
        risk.current?.rpn,
        joined(reactions.map((plan) => joined([plan.trigger, plan.immediateAction, plan.restartCriteria], ' | '))),
        statusLabel(risk.decision),
        risk.acceptanceJustification || '',
        joined(actions.map((action) => `${action.code}: ${action.description}`)),
        joined(actions.map((action) => action.responsible)),
        joined(actions.map((action) => formatIsoDate(action.targetDate))),
        joined(actions.map((action) => statusLabel(action.status))),
        risk.target?.severity,
        risk.target?.occurrence,
        risk.target?.detection,
        risk.target?.rpn,
        risk.residual?.severity,
        risk.residual?.occurrence,
        risk.residual?.detection,
        risk.residual?.rpn,
        risk.residual ? joined([risk.residual.verifiedBy, formatIsoDate(risk.residual.verifiedAt), risk.residual.rationale], ' | ') : '',
        risk.notes || ''
      ];
    });
  }

  function pfmeaSheet(project) {
    return {
      name: '02 PFMEA',
      rows: [headerRow(PFMEA_HEADERS), ...pfmeaDataRows(project)],
      widths: [13, 12, 25, 18, 42, 32, 16, 34, 48, 42, 7, 34, 38, 18, 7, 34, 45, 45, 7, 34, 11, 50, 24, 34, 48, 24, 18, 22, 10, 10, 10, 12, 10, 10, 10, 12, 38, 36],
      freezeRows: 1,
      autoFilter: true
    };
  }

  function rankingSheet(project, posterior = false) {
    const items = riskContexts(project).map((item) => {
      const rating = posterior ? (item.risk.residual || item.risk.target) : item.risk.current;
      return { ...item, rating };
    }).filter((item) => Number.isFinite(Number(item.rating?.rpn)))
      .sort((a, b) => Number(b.rating.rpn) - Number(a.rating.rpn) || Number(b.rating.severity) - Number(a.rating.severity));
    const rows = [
      headerRow(['Posición', 'Riesgo', 'Etapa', 'Modo de falla', 'Causa', 'G', 'O', 'D', 'RPN', 'Tipo de evaluación', 'Decisión']),
      ...items.map((item, index) => [
        index + 1,
        item.risk.code,
        `${item.stage?.code || ''} · ${item.stage?.name || ''}`,
        item.failureMode?.description || '',
        item.cause?.description || '',
        item.rating?.severity,
        item.rating?.occurrence,
        item.rating?.detection,
        item.rating?.rpn,
        posterior ? (item.risk.residual ? 'Residual verificada' : 'Objetivo proyectado') : 'Actual',
        statusLabel(item.risk.decision)
      ])
    ];
    return {
      name: posterior ? '04 Ranking posterior' : '03 Ranking actual',
      rows,
      widths: [10, 13, 32, 40, 40, 7, 7, 7, 10, 22, 24],
      freezeRows: 1,
      autoFilter: true
    };
  }

  function actionsSheet(project) {
    const rows = [
      headerRow(['Acción', 'Descripción', 'Tipo', 'Riesgos vinculados', 'Responsable', 'Área', 'Fecha objetivo', 'Prioridad', 'Estado', 'Fecha implementación', 'Resultado', 'Verificación', 'Evidencia', 'Comentarios']),
      ...project.actions.map((action) => [
        action.code,
        action.description,
        action.type,
        joined((action.linkedRiskIds || []).map((riskId) => project.risks.find((risk) => risk.id === riskId)?.code || riskId), ', '),
        action.responsible,
        action.area,
        formatIsoDate(action.targetDate),
        action.priority,
        statusLabel(action.status),
        formatIsoDate(action.implementedDate),
        action.result,
        joined([statusLabel(action.effectiveness?.status), action.effectiveness?.result, action.effectiveness?.verifiedBy, formatIsoDate(action.effectiveness?.verifiedAt)], ' | '),
        joined(action.evidence || []),
        action.notes
      ])
    ];
    return { name: '05 Plan de acciones', rows, widths: [13, 52, 24, 22, 24, 20, 16, 12, 24, 18, 40, 42, 40, 36], freezeRows: 1, autoFilter: true };
  }

  function scalesSheet(project) {
    const rows = [headerRow(['Escala', 'Revisión', 'Puntaje', 'Título', 'Descripción', 'Ejemplos'])];
    Object.values(project.methodology.scales).forEach((scale) => {
      scale.values.forEach((criterion) => rows.push([
        scale.name,
        scale.revision,
        criterion.score,
        criterion.title,
        criterion.description,
        joined(criterion.examples || [])
      ]));
    });
    rows.push([], sectionRow('Umbrales'), headerRow(['Criterio', 'Valor']));
    rows.push(
      ['Gravedad crítica', project.methodology.thresholds.criticalSeverity],
      ['RPN para revisión', project.methodology.thresholds.reviewRpn],
      ['RPN que requiere acción', project.methodology.thresholds.actionRpn],
      ['Detección débil', project.methodology.thresholds.weakDetection],
      ['Ocurrencia alta', project.methodology.thresholds.highOccurrence]
    );
    return { name: '06 Escalas', rows, widths: [22, 16, 10, 30, 75, 40], freezeRows: 1 };
  }

  function pendingSheet(project) {
    const issues = basicIssues(project);
    return {
      name: '07 Pendientes',
      rows: [headerRow(['Tipo', 'Elemento', 'Pendiente / advertencia']), ...(issues.length ? issues : [['Información', 'Proyecto', 'No se detectaron pendientes estructurales básicos']])],
      widths: [20, 36, 80],
      freezeRows: 1,
      autoFilter: true
    };
  }

  function revisionsSheet(project) {
    return {
      name: '08 Revisiones',
      rows: [
        headerRow(['Revisión', 'Fecha', 'Descripción', 'Responsable', 'Estado', 'Proyecto de origen']),
        ...project.revisionHistory.map((record) => [record.revision, formatIsoDate(record.date), record.description, record.responsible, statusLabel(record.status), record.sourceProjectId || ''])
      ],
      widths: [12, 16, 55, 24, 20, 36],
      freezeRows: 1,
      autoFilter: true
    };
  }

  function referencesSheet(project) {
    return {
      name: '09 Referencias',
      rows: [
        headerRow(['Código', 'Documento', 'Revisión', 'Tipo', 'Ubicación', 'Comentario']),
        ...project.references.map((reference) => [reference.code, reference.title, reference.revision, reference.type, reference.location, reference.comment])
      ],
      widths: [18, 55, 15, 24, 50, 50],
      freezeRows: 1,
      autoFilter: true
    };
  }

  function buildWorkbookSheets(project) {
    return [
      summarySheet(project),
      processSheet(project),
      pfmeaSheet(project),
      rankingSheet(project, false),
      rankingSheet(project, true),
      actionsSheet(project),
      scalesSheet(project),
      pendingSheet(project),
      revisionsSheet(project),
      referencesSheet(project)
    ];
  }

  function columnName(index) {
    let number = index + 1;
    let name = '';
    while (number > 0) {
      const remainder = (number - 1) % 26;
      name = String.fromCharCode(65 + remainder) + name;
      number = Math.floor((number - 1) / 26);
    }
    return name;
  }

  function normalizeCell(raw) {
    if (raw && typeof raw === 'object' && Object.prototype.hasOwnProperty.call(raw, 'value')) return raw;
    return { value: raw, style: 0 };
  }

  function worksheetXml(sheet) {
    const maxColumns = Math.max(1, ...sheet.rows.map((row) => row.length));
    const maxRows = Math.max(1, sheet.rows.length);
    const dimension = `A1:${columnName(maxColumns - 1)}${maxRows}`;
    const cols = (sheet.widths || []).map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${Math.max(4, Number(width || 12))}" customWidth="1"/>`).join('');
    const rows = sheet.rows.map((row, rowIndex) => {
      const rowNumber = rowIndex + 1;
      const cells = row.map((raw, columnIndex) => {
        const normalized = normalizeCell(raw);
        const ref = `${columnName(columnIndex)}${rowNumber}`;
        const style = Number(normalized.style || 0);
        const value = normalized.value;
        if (value === null || value === undefined || value === '') return `<c r="${ref}" s="${style}"/>`;
        if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
        const text = safeSpreadsheetText(value);
        return `<c r="${ref}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${escXml(text)}</t></is></c>`;
      }).join('');
      const height = row.some((raw) => String(normalizeCell(raw).value ?? '').includes('\n')) ? ' ht="42" customHeight="1"' : '';
      return `<row r="${rowNumber}"${height}>${cells}</row>`;
    }).join('');
    const freezeRows = Number(sheet.freezeRows || 0);
    const sheetViews = freezeRows > 0
      ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${freezeRows}" topLeftCell="A${freezeRows + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
      : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
    const autoFilter = sheet.autoFilter && sheet.rows.length > 1
      ? `<autoFilter ref="A1:${columnName(maxColumns - 1)}${sheet.rows.length}"/>`
      : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${sheetViews}<sheetFormatPr defaultRowHeight="18"/>${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${rows}</sheetData>${autoFilter}<pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`;
  }

  function stylesXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="4">
    <font><sz val="10"/><name val="Aptos"/><family val="2"/></font>
    <font><b/><sz val="10"/><color rgb="FF182230"/><name val="Aptos"/><family val="2"/></font>
    <font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Aptos"/><family val="2"/></font>
    <font><b/><sz val="16"/><color rgb="FF144C66"/><name val="Aptos Display"/><family val="2"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF144C66"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE7F3F7"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left style="thin"><color rgb="FFD7DEE7"/></left><right style="thin"><color rgb="FFD7DEE7"/></right><top style="thin"><color rgb="FFD7DEE7"/></top><bottom style="thin"><color rgb="FFD7DEE7"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="5">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
  }

  function workbookFiles(project) {
    const sheets = buildWorkbookSheets(project);
    const files = {};
    sheets.forEach((sheet, index) => {
      files[`xl/worksheets/sheet${index + 1}.xml`] = worksheetXml(sheet);
    });
    const sheetOverrides = sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
    files['[Content_Types].xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>${sheetOverrides}</Types>`;
    files['_rels/.rels'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
    files['xl/workbook.xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="25600" windowHeight="14400"/></bookViews><sheets>${sheets.map((sheet, index) => `<sheet name="${escXml(sheet.name.slice(0, 31))}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets><calcPr calcId="0" fullCalcOnLoad="1"/></workbook>`;
    files['xl/_rels/workbook.xml.rels'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
    files['xl/styles.xml'] = stylesXml();
    const now = new Date().toISOString();
    files['docProps/core.xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escXml(project.metadata.name)}</dc:title><dc:subject>AMFE de Proceso</dc:subject><dc:creator>PFMEA Flow</dc:creator><cp:lastModifiedBy>PFMEA Flow</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;
    files['docProps/app.xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>PFMEA Flow</Application><AppVersion>0.4.1</AppVersion><Company></Company><TitlesOfParts><vt:vector size="${sheets.length}" baseType="lpstr">${sheets.map((sheet) => `<vt:lpstr>${escXml(sheet.name)}</vt:lpstr>`).join('')}</vt:vector></TitlesOfParts></Properties>`;
    return files;
  }

  let crcTable = null;
  function getCrcTable() {
    if (crcTable) return crcTable;
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      crcTable[n] = c >>> 0;
    }
    return crcTable;
  }

  function crc32(bytes) {
    const table = getCrcTable();
    let crc = 0xffffffff;
    for (let index = 0; index < bytes.length; index += 1) crc = table[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  function writeU16(view, offset, value) {
    view.setUint16(offset, value, true);
  }

  function writeU32(view, offset, value) {
    view.setUint32(offset, value >>> 0, true);
  }

  function concatBytes(parts) {
    const size = parts.reduce((total, part) => total + part.length, 0);
    const result = new Uint8Array(size);
    let offset = 0;
    parts.forEach((part) => {
      result.set(part, offset);
      offset += part.length;
    });
    return result;
  }

  function dosDateTime(date = new Date()) {
    const year = Math.max(1980, date.getFullYear());
    const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
    const day = date.getDate();
    const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | day;
    return { time, date: dosDate };
  }

  function zipStored(files) {
    const localParts = [];
    const centralParts = [];
    let offset = 0;
    const timestamp = dosDateTime();
    Object.entries(files).forEach(([name, value]) => {
      const nameBytes = textEncoder.encode(name);
      const dataBytes = value instanceof Uint8Array ? value : textEncoder.encode(String(value));
      const crc = crc32(dataBytes);
      const local = new Uint8Array(30 + nameBytes.length);
      const localView = new DataView(local.buffer);
      writeU32(localView, 0, 0x04034b50);
      writeU16(localView, 4, 20);
      writeU16(localView, 6, 0x0800);
      writeU16(localView, 8, 0);
      writeU16(localView, 10, timestamp.time);
      writeU16(localView, 12, timestamp.date);
      writeU32(localView, 14, crc);
      writeU32(localView, 18, dataBytes.length);
      writeU32(localView, 22, dataBytes.length);
      writeU16(localView, 26, nameBytes.length);
      writeU16(localView, 28, 0);
      local.set(nameBytes, 30);
      localParts.push(local, dataBytes);

      const central = new Uint8Array(46 + nameBytes.length);
      const centralView = new DataView(central.buffer);
      writeU32(centralView, 0, 0x02014b50);
      writeU16(centralView, 4, 20);
      writeU16(centralView, 6, 20);
      writeU16(centralView, 8, 0x0800);
      writeU16(centralView, 10, 0);
      writeU16(centralView, 12, timestamp.time);
      writeU16(centralView, 14, timestamp.date);
      writeU32(centralView, 16, crc);
      writeU32(centralView, 20, dataBytes.length);
      writeU32(centralView, 24, dataBytes.length);
      writeU16(centralView, 28, nameBytes.length);
      writeU16(centralView, 30, 0);
      writeU16(centralView, 32, 0);
      writeU16(centralView, 34, 0);
      writeU16(centralView, 36, 0);
      writeU32(centralView, 38, 0);
      writeU32(centralView, 42, offset);
      central.set(nameBytes, 46);
      centralParts.push(central);
      offset += local.length + dataBytes.length;
    });
    const centralDirectory = concatBytes(centralParts);
    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    writeU32(endView, 0, 0x06054b50);
    writeU16(endView, 4, 0);
    writeU16(endView, 6, 0);
    writeU16(endView, 8, centralParts.length);
    writeU16(endView, 10, centralParts.length);
    writeU32(endView, 12, centralDirectory.length);
    writeU32(endView, 16, offset);
    writeU16(endView, 20, 0);
    return concatBytes([...localParts, centralDirectory, end]);
  }

  function buildXlsxBytes(project) {
    return zipStored(workbookFiles(project));
  }

  function downloadXlsx(project) {
    const bytes = buildXlsxBytes(project);
    const filename = `${safeFilename(project.metadata.code)}_Rev${safeFilename(project.metadata.revision)}_PFMEA.xlsx`;
    downloadBlob(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
    return filename;
  }

  function buildMapSvg(project, includeRisk = true) {
    const nodes = project.processMap.nodes.filter((node) => !node.archived);
    const edges = project.processMap.edges.filter((edge) => !edge.archived);
    if (!nodes.length) return '';
    const minX = Math.min(...nodes.map((node) => Number(node.position?.x || 0))) - 45;
    const minY = Math.min(...nodes.map((node) => Number(node.position?.y || 0))) - 70;
    const maxX = Math.max(...nodes.map((node) => Number(node.position?.x || 0) + 162)) + 45;
    const maxY = Math.max(...nodes.map((node) => Number(node.position?.y || 0) + 80)) + 70;
    const width = maxX - minX;
    const height = maxY - minY;
    const edgeSvg = edges.map((edge) => {
      const source = nodes.find((node) => node.id === edge.sourceNodeId);
      const target = nodes.find((node) => node.id === edge.targetNodeId);
      if (!source || !target) return '';
      const sx = Number(source.position.x) + 81;
      const sy = Number(source.position.y) + 38;
      const tx = Number(target.position.x) + 81;
      const ty = Number(target.position.y) + 38;
      const dx = tx - sx;
      const curve = Math.max(50, Math.abs(dx) * 0.35);
      const c1x = sx + (dx >= 0 ? curve : -curve);
      const c2x = tx - (dx >= 0 ? curve : -curve);
      const label = edge.label || edge.condition || '';
      return `<path d="M ${sx} ${sy} C ${c1x} ${sy}, ${c2x} ${ty}, ${tx} ${ty}" fill="none" stroke="#7b8b9c" stroke-width="2" ${edge.flowType !== 'normal' ? 'stroke-dasharray="6 5"' : ''} marker-end="url(#arrow)"/>${label ? `<text x="${(sx + tx) / 2}" y="${(sy + ty) / 2 - 7}" font-size="11" text-anchor="middle" fill="#475467">${escXml(label)}</text>` : ''}`;
    }).join('');
    const nodeSvg = nodes.map((node) => {
      const x = Number(node.position.x);
      const y = Number(node.position.y);
      const risks = PFMEA_MODEL.stageRisks(project, node.id);
      const maxRpn = risks.reduce((max, risk) => Math.max(max, Number(risk.current?.rpn || 0)), 0);
      const round = ['start', 'end'].includes(node.type) ? 30 : 10;
      const fill = node.type === 'decision' ? '#fffaf0' : node.type === 'inspection' ? '#f1fbf9' : node.type === 'rework' ? '#fff7ed' : '#ffffff';
      const riskLine = includeRisk ? `${risks.length} riesgos${maxRpn ? ` · RPN ${maxRpn}` : ''}` : NODE_LABELS[node.type] || node.type;
      return `<g><rect x="${x}" y="${y}" width="162" height="76" rx="${round}" fill="${fill}" stroke="#718096"/><text x="${x + 12}" y="${y + 19}" font-size="10" font-weight="700" fill="#667085">${escXml(`${node.code} · ${NODE_LABELS[node.type] || node.type}`)}</text><text x="${x + 12}" y="${y + 39}" font-size="12" font-weight="700" fill="#182230">${escXml(String(node.name || '').length > 23 ? `${String(node.name).slice(0, 22)}…` : node.name)}</text><text x="${x + 12}" y="${y + 59}" font-size="10" fill="#667085">${escXml(riskLine)}</text></g>`;
    }).join('');
    const titleY = minY + 24;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${minX} ${minY} ${width} ${height}" role="img" aria-label="Mapa del proceso"><defs><marker id="arrow" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0,10 3.5,0 7" fill="#7b8b9c"/></marker></defs><rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="#f9fbfc"/><text x="${minX + 12}" y="${titleY}" font-family="Arial, sans-serif" font-size="18" font-weight="700" fill="#182230">${escXml(project.metadata.name)}</text><text x="${minX + 12}" y="${titleY + 18}" font-family="Arial, sans-serif" font-size="11" fill="#667085">${escXml(`${project.metadata.code} · Rev. ${project.metadata.revision}`)}</text><g font-family="Arial, sans-serif">${edgeSvg}${nodeSvg}</g></svg>`;
  }

  function buildPrintableReportHtml(project) {
    const metrics = PFMEA_MODEL.projectMetrics(project);
    const items = riskContexts(project);
    const top = [...items].sort((a, b) => Number(b.risk.current?.rpn || 0) - Number(a.risk.current?.rpn || 0)).slice(0, 12);
    const map = buildMapSvg(project, true);
    const generated = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date());
    const detailRows = items.map((item) => {
      const preventive = controlsFor(project, item, 'preventive');
      const detection = controlsFor(project, item, 'detection');
      const actions = actionsFor(project, item.risk);
      return `<tr><td>${escHtml(item.risk.code)}</td><td>${escHtml(`${item.stage?.code || ''} · ${item.stage?.name || ''}`)}</td><td>${escHtml(item.fn?.description || '')}</td><td>${escHtml(item.failureMode?.description || '')}</td><td>${escHtml(item.governingEffect?.description || '')}</td><td class="num">${escHtml(item.risk.current?.severity ?? '')}</td><td>${escHtml(item.cause?.description || '')}</td><td class="num">${escHtml(item.risk.current?.occurrence ?? '')}</td><td>${escHtml(joined(preventive.map((control) => control.description), '; '))}</td><td>${escHtml(joined(detection.map((control) => control.description), '; '))}</td><td class="num">${escHtml(item.risk.current?.detection ?? '')}</td><td class="num strong">${escHtml(item.risk.current?.rpn ?? '')}</td><td>${escHtml(statusLabel(item.risk.decision))}</td><td>${escHtml(joined(actions.map((action) => `${action.code}: ${action.description}`), '; '))}</td></tr>`;
    }).join('');
    const actionRows = project.actions.map((action) => `<tr><td>${escHtml(action.code)}</td><td>${escHtml(action.description)}</td><td>${escHtml(action.responsible)}</td><td>${escHtml(formatIsoDate(action.targetDate))}</td><td>${escHtml(statusLabel(action.status))}</td><td>${escHtml(joined((action.linkedRiskIds || []).map((id) => project.risks.find((risk) => risk.id === id)?.code || id), ', '))}</td></tr>`).join('');
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escHtml(project.metadata.code)} · Informe PFMEA</title><style>
      @page { size: A4 landscape; margin: 9mm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #182230; font-family: Arial, sans-serif; font-size: 9pt; }
      h1 { margin: 0 0 3mm; color: #144c66; font-size: 22pt; }
      h2 { margin: 7mm 0 3mm; color: #144c66; font-size: 14pt; border-bottom: 1px solid #b8c3d1; padding-bottom: 1.5mm; }
      p { line-height: 1.35; }
      .meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 2mm; margin-bottom: 4mm; }
      .meta div, .kpi { border: 1px solid #d7dee7; border-radius: 2mm; padding: 2.5mm; }
      .label { color: #667085; font-size: 8pt; text-transform: uppercase; letter-spacing: .03em; }
      .value { font-weight: 700; margin-top: 1mm; }
      .draft { padding: 2mm 3mm; background: #fff6ed; border: 1px solid #f6c38b; font-weight: 700; margin: 3mm 0; }
      .kpis { display: grid; grid-template-columns: repeat(6, 1fr); gap: 2mm; }
      .kpi strong { display: block; font-size: 16pt; color: #144c66; }
      table { width: 100%; border-collapse: collapse; page-break-inside: auto; }
      th, td { border: 1px solid #cfd7e2; padding: 1.4mm; vertical-align: top; white-space: pre-wrap; }
      th { background: #144c66; color: white; font-weight: 700; }
      tr { page-break-inside: avoid; page-break-after: auto; }
      .num { text-align: center; }
      .strong { font-weight: 700; }
      .map { border: 1px solid #d7dee7; padding: 2mm; overflow: hidden; }
      .map svg { width: 100%; height: auto; max-height: 165mm; }
      .scope { display: grid; grid-template-columns: 1fr 1fr; gap: 2mm 6mm; }
      .scope div { border-bottom: 1px solid #e2e8f0; padding: 1.5mm 0; }
      .page-break { break-before: page; }
      .footer { margin-top: 5mm; color: #667085; font-size: 8pt; }
      @media screen { body { padding: 12mm; max-width: 1400px; margin: auto; background: #f3f6f9; } main { background: white; padding: 10mm; box-shadow: 0 10px 30px rgba(16,24,40,.12); } }
    </style></head><body><main>
      <h1>AMFE de Proceso · ${escHtml(project.metadata.name)}</h1>
      ${project.metadata.status === 'draft' ? '<div class="draft">BORRADOR · El análisis contiene información en elaboración.</div>' : ''}
      <div class="meta">
        <div><span class="label">Código</span><div class="value">${escHtml(project.metadata.code)}</div></div>
        <div><span class="label">Revisión</span><div class="value">${escHtml(project.metadata.revision)}</div></div>
        <div><span class="label">Estado</span><div class="value">${escHtml(statusLabel(project.metadata.status))}</div></div>
        <div><span class="label">Generado</span><div class="value">${escHtml(generated)}</div></div>
        <div><span class="label">Proceso</span><div class="value">${escHtml(project.metadata.processName)}</div></div>
        <div><span class="label">Producto</span><div class="value">${escHtml(project.metadata.productFamily)}</div></div>
        <div><span class="label">Sitio / línea</span><div class="value">${escHtml(joined([project.metadata.site, project.metadata.areaLine], ' · '))}</div></div>
        <div><span class="label">Responsable</span><div class="value">${escHtml(project.metadata.owner)}</div></div>
      </div>
      <div class="kpis">
        <div class="kpi"><strong>${metrics.stages}</strong>Etapas</div>
        <div class="kpi"><strong>${metrics.risks}</strong>Riesgos</div>
        <div class="kpi"><strong>${metrics.maxRpn}</strong>RPN máximo</div>
        <div class="kpi"><strong>${metrics.criticalRisks}</strong>Prioritarios</div>
        <div class="kpi"><strong>${metrics.openActions}</strong>Acciones abiertas</div>
        <div class="kpi"><strong>${metrics.totalProgress}%</strong>Avance</div>
      </div>
      <h2>Alcance</h2>
      <div class="scope">
        <div><span class="label">Objetivo</span><p>${escHtml(project.scope.objective)}</p></div>
        <div><span class="label">Inicio</span><p>${escHtml(project.scope.processStart)}</p></div>
        <div><span class="label">Fin</span><p>${escHtml(project.scope.processEnd)}</p></div>
        <div><span class="label">Exclusiones</span><p>${escHtml(project.scope.exclusions)}</p></div>
      </div>
      ${map ? `<h2>Mapa del proceso</h2><div class="map">${map}</div>` : ''}
      <div class="page-break"></div>
      <h2>Riesgos principales</h2>
      <table><thead><tr><th>Riesgo</th><th>Etapa</th><th>Modo de falla</th><th>Causa</th><th>G</th><th>O</th><th>D</th><th>RPN</th><th>Decisión</th></tr></thead><tbody>${top.map((item) => `<tr><td>${escHtml(item.risk.code)}</td><td>${escHtml(item.stage?.name || '')}</td><td>${escHtml(item.failureMode?.description || '')}</td><td>${escHtml(item.cause?.description || '')}</td><td class="num">${escHtml(item.risk.current?.severity ?? '')}</td><td class="num">${escHtml(item.risk.current?.occurrence ?? '')}</td><td class="num">${escHtml(item.risk.current?.detection ?? '')}</td><td class="num strong">${escHtml(item.risk.current?.rpn ?? '')}</td><td>${escHtml(statusLabel(item.risk.decision))}</td></tr>`).join('')}</tbody></table>
      <h2>Plan de acciones</h2>
      <table><thead><tr><th>Acción</th><th>Descripción</th><th>Responsable</th><th>Fecha</th><th>Estado</th><th>Riesgos</th></tr></thead><tbody>${actionRows || '<tr><td colspan="6">No se registraron acciones.</td></tr>'}</tbody></table>
      <div class="page-break"></div>
      <h2>Matriz PFMEA completa</h2>
      <table><thead><tr><th>Riesgo</th><th>Etapa</th><th>Función</th><th>Modo de falla</th><th>Efecto</th><th>G</th><th>Causa</th><th>O</th><th>Prevención</th><th>Detección</th><th>D</th><th>RPN</th><th>Decisión</th><th>Acciones</th></tr></thead><tbody>${detailRows || '<tr><td colspan="14">No se registraron riesgos.</td></tr>'}</tbody></table>
      <p class="footer">Generado por PFMEA Flow v0.4.1. Esta salida no constituye firma electrónica ni reemplaza el repositorio documental controlado.</p>
    </main></body></html>`;
  }

  function openPrintableReport(project) {
    const reportWindow = window.open('', '_blank');
    if (!reportWindow) throw new Error('El navegador bloqueó la ventana del informe. Habilitá las ventanas emergentes para esta página.');
    reportWindow.document.open();
    reportWindow.document.write(buildPrintableReportHtml(project));
    reportWindow.document.close();
    reportWindow.focus();
    setTimeout(() => reportWindow.print(), 350);
    return `${safeFilename(project.metadata.code)}_Rev${safeFilename(project.metadata.revision)}_Informe_PFMEA.pdf`;
  }

  function downloadReportHtml(project) {
    const filename = `${safeFilename(project.metadata.code)}_Rev${safeFilename(project.metadata.revision)}_Informe_PFMEA.html`;
    downloadBlob(new Blob([buildPrintableReportHtml(project)], { type: 'text/html;charset=utf-8' }), filename);
    return filename;
  }

  window.PFMEA_EXPORTERS = {
    buildWorkbookSheets,
    buildXlsxBytes,
    downloadXlsx,
    buildMapSvg,
    buildPrintableReportHtml,
    openPrintableReport,
    downloadReportHtml,
    basicIssues
  };
})();
