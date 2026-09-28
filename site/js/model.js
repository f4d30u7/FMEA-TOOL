(function () {
  'use strict';

  const SCHEMA_VERSION = '0.4.0';
  const APP_VERSION = '0.4.1-github-pages';

  const nowIso = () => new Date().toISOString();
  const uuid = () => {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }
    return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  };

  const severityCriteria = [
    ['Sin efecto', 'No se percibe efecto en el proceso, producto o cliente.'],
    ['Efecto menor', 'Desviación insignificante, sin impacto funcional apreciable.'],
    ['Molestia leve', 'Efecto menor detectable internamente, con corrección simple.'],
    ['Degradación menor', 'Retrabajo o pérdida menor sin afectar requisitos críticos.'],
    ['Degradación moderada', 'Pérdida parcial de desempeño o incumplimiento moderado.'],
    ['Efecto significativo', 'Producto o proceso fuera de requisito con impacto relevante.'],
    ['Efecto alto', 'Pérdida importante de función, reclamo probable o descarte.'],
    ['Efecto muy alto', 'Pérdida de función principal o incumplimiento regulatorio relevante.'],
    ['Peligroso con advertencia', 'Riesgo potencial para seguridad o incumplimiento severo con señales previas.'],
    ['Peligroso sin advertencia', 'Riesgo crítico para seguridad, salud o cumplimiento sin advertencia suficiente.']
  ];

  const occurrenceCriteria = [
    ['Remota', 'Falla prácticamente eliminada mediante diseño o prevención probada.'],
    ['Muy baja', 'Historial excepcional; ocurrencia altamente improbable.'],
    ['Baja', 'Pocos eventos aislados o proceso muy capaz.'],
    ['Moderadamente baja', 'Ocurrencia ocasional con prevención estable.'],
    ['Moderada', 'Variación conocida y eventos esporádicos.'],
    ['Moderadamente alta', 'Eventos repetidos o capacidad marginal.'],
    ['Alta', 'Falla frecuente; prevención insuficiente.'],
    ['Muy alta', 'Falla muy frecuente o proceso inestable.'],
    ['Casi inevitable', 'La causa ocurre de forma habitual.'],
    ['Inevitable', 'No existe prevención efectiva o la causa está presente continuamente.']
  ];

  const detectionCriteria = [
    ['Casi segura', 'El control previene o detecta automáticamente antes de avanzar.'],
    ['Muy alta', 'Detección automática robusta con rechazo o interlock validado.'],
    ['Alta', 'Control efectivo con muy baja probabilidad de escape.'],
    ['Moderadamente alta', 'Control consistente, aunque no completamente automático.'],
    ['Moderada', 'Muestreo o control con capacidad razonable de detección.'],
    ['Moderadamente baja', 'La detección depende de frecuencia limitada o juicio humano.'],
    ['Baja', 'Control débil o alejado del punto de generación.'],
    ['Muy baja', 'Detección improbable antes del siguiente proceso o cliente.'],
    ['Remota', 'Solo puede detectarse por evidencia indirecta o al final del proceso.'],
    ['Sin detección', 'No existe control capaz de detectar la causa o el modo de falla.']
  ];

  function buildScale(id, name, criteria) {
    return {
      id,
      name,
      revision: 'Genérica 0.1',
      locked: false,
      values: criteria.map((entry, index) => ({
        score: index + 1,
        title: entry[0],
        description: entry[1],
        examples: []
      }))
    };
  }

  function defaultMethodology() {
    return {
      method: 'RPN clásico',
      scaleRange: { min: 1, max: 10 },
      scales: {
        severity: buildScale('scale-severity-generic', 'Gravedad', severityCriteria),
        occurrence: buildScale('scale-occurrence-generic', 'Ocurrencia', occurrenceCriteria),
        detection: buildScale('scale-detection-generic', 'Detección', detectionCriteria)
      },
      thresholds: {
        criticalSeverity: 9,
        reviewRpn: 120,
        actionRpn: 180,
        weakDetection: 7,
        highOccurrence: 7
      },
      specialCharacteristics: [
        { id: 'sc-safety', code: 'S', label: 'Seguridad' },
        { id: 'sc-regulatory', code: 'R', label: 'Regulatoria' },
        { id: 'sc-critical', code: 'C', label: 'Crítica' },
        { id: 'sc-significant', code: 'SC', label: 'Significativa' },
        { id: 'sc-quality', code: 'Q', label: 'Calidad' },
        { id: 'sc-environmental', code: 'E', label: 'Ambiental' }
      ]
    };
  }

  function emptyWorkflow() {
    return {
      sectionStatus: {
        setup: 'in-progress',
        map: 'not-started',
        analysis: 'not-started',
        actions: 'not-started',
        review: 'not-started',
        export: 'not-started'
      },
      stageStatus: {},
      reviewRequiredStageIds: [],
      closure: {
        comment: '',
        exceptions: [],
        confirmedBy: '',
        confirmedAt: null
      }
    };
  }

  function emptyClientState() {
    return {
      lastRoute: '',
      selectedMapNodeId: null,
      selectedFunctionId: null,
      selectedFailureModeId: null,
      selectedCauseId: null,
      selectedRiskId: null,
      setupTab: 'identification',
      analysisTab: 'chain',
      showAdvancedFields: false,
      libraryFilter: 'all'
    };
  }

  function createProject(input = {}) {
    const id = input.id || uuid();
    const now = nowIso();
    return {
      schemaVersion: SCHEMA_VERSION,
      appVersion: APP_VERSION,
      id,
      metadata: {
        name: input.name || 'Nuevo PFMEA',
        code: input.code || `PFMEA-${String(Date.now()).slice(-5)}`,
        revision: input.revision || '00',
        status: 'draft',
        processName: input.processName || '',
        productFamily: input.productFamily || '',
        site: input.site || '',
        areaLine: input.areaLine || '',
        owner: input.owner || '',
        customer: '',
        projectReference: '',
        changeNumber: '',
        startDate: now.slice(0, 10),
        targetDate: '',
        createdAt: now,
        updatedAt: now,
        lastExternalBackupAt: null,
        lastExportAt: null,
        sourceProjectId: input.sourceProjectId || null,
        previousRevisionId: input.previousRevisionId || null,
        summaryOfChanges: ''
      },
      scope: {
        objective: '',
        processStart: '',
        processEnd: '',
        includedProducts: '',
        exclusions: '',
        assumptions: '',
        interfaces: '',
        externalProcesses: '',
        constraints: ''
      },
      team: [],
      references: [],
      methodology: defaultMethodology(),
      processMap: {
        confirmedAt: null,
        confirmedBy: '',
        nodes: [],
        edges: [],
        validationAcknowledgements: []
      },
      functions: [],
      failureModes: [],
      effects: [],
      causes: [],
      controls: [],
      controlLinks: [],
      reactionPlans: [],
      risks: [],
      actions: [],
      revisionHistory: [
        {
          id: uuid(),
          revision: input.revision || '00',
          date: now.slice(0, 10),
          description: 'Creación del proyecto',
          responsible: input.owner || '',
          status: 'draft',
          sourceProjectId: input.sourceProjectId || null
        }
      ],
      exportHistory: [],
      workflow: emptyWorkflow(),
      clientState: emptyClientState()
    };
  }

  function sampleProject() {
    const project = {
    "schemaVersion": "0.4.0",
    "appVersion": "0.4.0-local-first",
    "id": "pfmea-demo-llenado",
    "metadata": {
        "name": "Ejemplo - Línea de llenado",
        "code": "PFMEA-DEMO-001",
        "revision": "02",
        "status": "draft",
        "processName": "Preparación, llenado y empaque de botellas",
        "productFamily": "Producto líquido de consumo",
        "site": "Planta de ejemplo",
        "areaLine": "Línea de llenado",
        "owner": "Equipo de Calidad",
        "customer": "",
        "projectReference": "",
        "changeNumber": "",
        "startDate": "2026-08-28",
        "targetDate": "",
        "createdAt": "2026-01-01T00:00:00.000Z",
        "updatedAt": "2026-01-01T00:00:00.000Z",
        "lastExternalBackupAt": null,
        "lastExportAt": null,
        "sourceProjectId": null,
        "previousRevisionId": null,
        "summaryOfChanges": ""
    },
    "scope": {
        "objective": "Identificar y reducir riesgos de un proceso genérico de preparación, llenado, tapado e inspección.",
        "processStart": "Liberación de materias primas y componentes para producción.",
        "processEnd": "Pallet de producto terminado identificado y transferido a almacén.",
        "includedProducts": "Formato de botella utilizado como ejemplo de capacitación.",
        "exclusions": "Distribución externa y desempeño del producto durante el uso del consumidor.",
        "assumptions": "Equipos instalados y parámetros iniciales definidos para el ejercicio.",
        "interfaces": "Almacén, laboratorio de Control de Calidad, Mantenimiento y Planeamiento.",
        "externalProcesses": "Calibraciones y ensayos específicos realizados por proveedores aprobados.",
        "constraints": "Proyecto demostrativo sin datos de una empresa o producto real."
    },
    "team": [
        {
            "id": "team-qa",
            "name": "Facilitador de Calidad",
            "role": "Facilitador PFMEA",
            "area": "Aseguramiento de Calidad",
            "specialty": "Gestión de riesgos"
        },
        {
            "id": "team-prod",
            "name": "Responsable de Producción",
            "role": "Dueño del proceso",
            "area": "Producción",
            "specialty": "Operación de línea"
        },
        {
            "id": "team-eng",
            "name": "Ingeniería de Proceso",
            "role": "Especialista",
            "area": "Ingeniería",
            "specialty": "Diseño y automatización"
        },
        {
            "id": "team-maint",
            "name": "Mantenimiento",
            "role": "Especialista",
            "area": "Mantenimiento",
            "specialty": "Confiabilidad de equipos"
        }
    ],
    "references": [
        {
            "id": "ref-001",
            "code": "PC-DEMO-001",
            "title": "Plan de Control de Procesos",
            "revision": "Borrador",
            "type": "Plan de Control",
            "location": "Repositorio del proyecto",
            "comment": ""
        },
        {
            "id": "ref-002",
            "code": "PFD-DEMO-01",
            "title": "Diagrama de flujo de proceso",
            "revision": "02",
            "type": "Diagrama",
            "location": "Ingeniería de Proyecto",
            "comment": ""
        },
        {
            "id": "ref-003",
            "code": "URS-DEMO-01",
            "title": "Requerimientos de usuario de la línea",
            "revision": "Final",
            "type": "Especificación",
            "location": "Repositorio del proyecto",
            "comment": ""
        }
    ],
    "methodology": {
        "method": "RPN clásico",
        "scaleRange": {
            "min": 1,
            "max": 10
        },
        "scales": {
            "severity": {
                "id": "scale-severity-generic",
                "name": "Gravedad",
                "revision": "Genérica 0.1",
                "locked": false,
                "values": [
                    {
                        "score": 1,
                        "title": "Sin efecto",
                        "description": "No se percibe efecto en el proceso, producto o cliente.",
                        "examples": []
                    },
                    {
                        "score": 2,
                        "title": "Efecto menor",
                        "description": "Desviación insignificante, sin impacto funcional apreciable.",
                        "examples": []
                    },
                    {
                        "score": 3,
                        "title": "Molestia leve",
                        "description": "Efecto menor detectable internamente, con corrección simple.",
                        "examples": []
                    },
                    {
                        "score": 4,
                        "title": "Degradación menor",
                        "description": "Retrabajo o pérdida menor sin afectar requisitos críticos.",
                        "examples": []
                    },
                    {
                        "score": 5,
                        "title": "Degradación moderada",
                        "description": "Pérdida parcial de desempeño o incumplimiento moderado.",
                        "examples": []
                    },
                    {
                        "score": 6,
                        "title": "Efecto significativo",
                        "description": "Producto o proceso fuera de requisito con impacto relevante.",
                        "examples": []
                    },
                    {
                        "score": 7,
                        "title": "Efecto alto",
                        "description": "Pérdida importante de función, reclamo probable o descarte.",
                        "examples": []
                    },
                    {
                        "score": 8,
                        "title": "Efecto muy alto",
                        "description": "Pérdida de función principal o incumplimiento regulatorio relevante.",
                        "examples": []
                    },
                    {
                        "score": 9,
                        "title": "Peligroso con advertencia",
                        "description": "Riesgo potencial para seguridad o incumplimiento severo con señales previas.",
                        "examples": []
                    },
                    {
                        "score": 10,
                        "title": "Peligroso sin advertencia",
                        "description": "Riesgo crítico para seguridad, salud o cumplimiento sin advertencia suficiente.",
                        "examples": []
                    }
                ]
            },
            "occurrence": {
                "id": "scale-occurrence-generic",
                "name": "Ocurrencia",
                "revision": "Genérica 0.1",
                "locked": false,
                "values": [
                    {
                        "score": 1,
                        "title": "Remota",
                        "description": "Falla prácticamente eliminada mediante diseño o prevención probada.",
                        "examples": []
                    },
                    {
                        "score": 2,
                        "title": "Muy baja",
                        "description": "Historial excepcional; ocurrencia altamente improbable.",
                        "examples": []
                    },
                    {
                        "score": 3,
                        "title": "Baja",
                        "description": "Pocos eventos aislados o proceso muy capaz.",
                        "examples": []
                    },
                    {
                        "score": 4,
                        "title": "Moderadamente baja",
                        "description": "Ocurrencia ocasional con prevención estable.",
                        "examples": []
                    },
                    {
                        "score": 5,
                        "title": "Moderada",
                        "description": "Variación conocida y eventos esporádicos.",
                        "examples": []
                    },
                    {
                        "score": 6,
                        "title": "Moderadamente alta",
                        "description": "Eventos repetidos o capacidad marginal.",
                        "examples": []
                    },
                    {
                        "score": 7,
                        "title": "Alta",
                        "description": "Falla frecuente; prevención insuficiente.",
                        "examples": []
                    },
                    {
                        "score": 8,
                        "title": "Muy alta",
                        "description": "Falla muy frecuente o proceso inestable.",
                        "examples": []
                    },
                    {
                        "score": 9,
                        "title": "Casi inevitable",
                        "description": "La causa ocurre de forma habitual.",
                        "examples": []
                    },
                    {
                        "score": 10,
                        "title": "Inevitable",
                        "description": "No existe prevención efectiva o la causa está presente continuamente.",
                        "examples": []
                    }
                ]
            },
            "detection": {
                "id": "scale-detection-generic",
                "name": "Detección",
                "revision": "Genérica 0.1",
                "locked": false,
                "values": [
                    {
                        "score": 1,
                        "title": "Casi segura",
                        "description": "El control previene o detecta automáticamente antes de avanzar.",
                        "examples": []
                    },
                    {
                        "score": 2,
                        "title": "Muy alta",
                        "description": "Detección automática robusta con rechazo o interlock validado.",
                        "examples": []
                    },
                    {
                        "score": 3,
                        "title": "Alta",
                        "description": "Control efectivo con muy baja probabilidad de escape.",
                        "examples": []
                    },
                    {
                        "score": 4,
                        "title": "Moderadamente alta",
                        "description": "Control consistente, aunque no completamente automático.",
                        "examples": []
                    },
                    {
                        "score": 5,
                        "title": "Moderada",
                        "description": "Muestreo o control con capacidad razonable de detección.",
                        "examples": []
                    },
                    {
                        "score": 6,
                        "title": "Moderadamente baja",
                        "description": "La detección depende de frecuencia limitada o juicio humano.",
                        "examples": []
                    },
                    {
                        "score": 7,
                        "title": "Baja",
                        "description": "Control débil o alejado del punto de generación.",
                        "examples": []
                    },
                    {
                        "score": 8,
                        "title": "Muy baja",
                        "description": "Detección improbable antes del siguiente proceso o cliente.",
                        "examples": []
                    },
                    {
                        "score": 9,
                        "title": "Remota",
                        "description": "Solo puede detectarse por evidencia indirecta o al final del proceso.",
                        "examples": []
                    },
                    {
                        "score": 10,
                        "title": "Sin detección",
                        "description": "No existe control capaz de detectar la causa o el modo de falla.",
                        "examples": []
                    }
                ]
            }
        },
        "thresholds": {
            "criticalSeverity": 9,
            "reviewRpn": 120,
            "actionRpn": 180,
            "weakDetection": 7,
            "highOccurrence": 7
        },
        "specialCharacteristics": [
            {
                "id": "sc-safety",
                "code": "S",
                "label": "Seguridad"
            },
            {
                "id": "sc-regulatory",
                "code": "R",
                "label": "Regulatoria"
            },
            {
                "id": "sc-critical",
                "code": "C",
                "label": "Crítica"
            },
            {
                "id": "sc-significant",
                "code": "SC",
                "label": "Significativa"
            },
            {
                "id": "sc-quality",
                "code": "Q",
                "label": "Calidad"
            },
            {
                "id": "sc-environmental",
                "code": "E",
                "label": "Ambiental"
            }
        ]
    },
    "processMap": {
        "confirmedAt": "2026-08-26T18:15:19.969Z",
        "confirmedBy": "Equipo PFMEA",
        "nodes": [
            {
                "id": "stage-start",
                "code": "00",
                "name": "Inicio",
                "type": "start",
                "description": "Materiales liberados y orden disponible",
                "area": "Almacén",
                "station": "",
                "inputs": [],
                "outputs": [],
                "equipment": [],
                "materials": [],
                "parameters": [],
                "responsible": "",
                "analysisOrder": 0,
                "position": {
                    "x": 60,
                    "y": 210
                },
                "status": "active",
                "archived": false
            },
            {
                "id": "stage-010",
                "code": "10",
                "name": "Preparación de producto",
                "type": "operation",
                "description": "Preparación y acondicionamiento del producto para llenado",
                "area": "Preparación",
                "station": "Tanque de preparación",
                "inputs": [
                    "Producto a granel"
                ],
                "outputs": [
                    "Producto preparado"
                ],
                "equipment": [
                    "Tanque"
                ],
                "materials": [
                    "Producto a granel"
                ],
                "parameters": [
                    "Tiempo",
                    "Temperatura"
                ],
                "responsible": "Producción",
                "analysisOrder": 10,
                "position": {
                    "x": 270,
                    "y": 100
                },
                "status": "active",
                "archived": false
            },
            {
                "id": "stage-020",
                "code": "20",
                "name": "Alimentación de componentes",
                "type": "operation",
                "description": "Alimentación de envases y componentes a la línea",
                "area": "Producción",
                "station": "Alimentador",
                "inputs": [
                    "Componentes"
                ],
                "outputs": [
                    "Componentes posicionados"
                ],
                "equipment": [
                    "Alimentador"
                ],
                "materials": [
                    "Envase vacío"
                ],
                "parameters": [
                    "Orientación"
                ],
                "responsible": "Producción",
                "analysisOrder": 20,
                "position": {
                    "x": 490,
                    "y": 100
                },
                "status": "active",
                "archived": false
            },
            {
                "id": "stage-030",
                "code": "30",
                "name": "Llenado",
                "type": "operation",
                "description": "Llenado controlada del producto sobre el envase",
                "area": "Producción",
                "station": "Llenador",
                "inputs": [
                    "Producto",
                    "Envase"
                ],
                "outputs": [
                    "Botella llenada"
                ],
                "equipment": [
                    "Sistema de llenado"
                ],
                "materials": [
                    "Producto preparado",
                    "Envase vacío"
                ],
                "parameters": [
                    "Peso llenado",
                    "Presión",
                    "Velocidad"
                ],
                "responsible": "Producción",
                "analysisOrder": 30,
                "position": {
                    "x": 710,
                    "y": 100
                },
                "status": "active",
                "archived": false
            },
            {
                "id": "stage-040",
                "code": "40",
                "name": "¿Peso conforme?",
                "type": "decision",
                "description": "Verificación automática del peso llenado",
                "area": "Producción",
                "station": "Controladora de peso",
                "inputs": [
                    "Botella llenada"
                ],
                "outputs": [
                    "Conforme",
                    "No conforme"
                ],
                "equipment": [
                    "Controladora de peso"
                ],
                "materials": [],
                "parameters": [
                    "Peso"
                ],
                "responsible": "Producción",
                "analysisOrder": 40,
                "position": {
                    "x": 930,
                    "y": 100
                },
                "status": "active",
                "archived": false
            },
            {
                "id": "stage-050",
                "code": "50",
                "name": "Tapado",
                "type": "operation",
                "description": "Cierre del producto y ensamblado final",
                "area": "Producción",
                "station": "Tapadora",
                "inputs": [
                    "Botella llenada"
                ],
                "outputs": [
                    "Botella tapada"
                ],
                "equipment": [
                    "Tapadora"
                ],
                "materials": [
                    "Tapas"
                ],
                "parameters": [
                    "Fuerza",
                    "Posición"
                ],
                "responsible": "Producción",
                "analysisOrder": 50,
                "position": {
                    "x": 1150,
                    "y": 100
                },
                "status": "active",
                "archived": false
            },
            {
                "id": "stage-060",
                "code": "60",
                "name": "Rechazo y segregación",
                "type": "rework",
                "description": "Rechazo automático y segregación de botellas fuera de peso",
                "area": "Producción",
                "station": "Estación de rechazo",
                "inputs": [
                    "Botella no conforme"
                ],
                "outputs": [
                    "Botella segregada"
                ],
                "equipment": [
                    "Sistema de rechazo"
                ],
                "materials": [],
                "parameters": [
                    "Confirmación de rechazo"
                ],
                "responsible": "Producción",
                "analysisOrder": 60,
                "position": {
                    "x": 930,
                    "y": 320
                },
                "status": "active",
                "archived": false
            },
            {
                "id": "stage-070",
                "code": "70",
                "name": "Inspección final",
                "type": "inspection",
                "description": "Inspección visual y funcional del producto terminado",
                "area": "Calidad en línea",
                "station": "Inspección final",
                "inputs": [
                    "Botella tapada"
                ],
                "outputs": [
                    "Botella inspeccionada"
                ],
                "equipment": [
                    "Dispositivos de inspección"
                ],
                "materials": [],
                "parameters": [
                    "Apariencia",
                    "Integridad"
                ],
                "responsible": "Producción / QA",
                "analysisOrder": 70,
                "position": {
                    "x": 1150,
                    "y": 320
                },
                "status": "active",
                "archived": false
            },
            {
                "id": "stage-080",
                "code": "80",
                "name": "Empaque",
                "type": "operation",
                "description": "Acondicionamiento secundario y armado de pallet",
                "area": "Empaque",
                "station": "Empaque final",
                "inputs": [
                    "Botella conforme"
                ],
                "outputs": [
                    "Pallet terminado"
                ],
                "equipment": [
                    "Encajonadora"
                ],
                "materials": [
                    "Cajas",
                    "Etiquetas"
                ],
                "parameters": [
                    "Cantidad",
                    "Identificación"
                ],
                "responsible": "Producción",
                "analysisOrder": 80,
                "position": {
                    "x": 930,
                    "y": 540
                },
                "status": "active",
                "archived": false
            },
            {
                "id": "stage-end",
                "code": "90",
                "name": "Fin",
                "type": "end",
                "description": "Pallet transferido a almacén",
                "area": "Almacén",
                "station": "",
                "inputs": [],
                "outputs": [],
                "equipment": [],
                "materials": [],
                "parameters": [],
                "responsible": "",
                "analysisOrder": 90,
                "position": {
                    "x": 1150,
                    "y": 550
                },
                "status": "active",
                "archived": false
            }
        ],
        "edges": [
            {
                "id": "edge-001",
                "sourceNodeId": "stage-start",
                "targetNodeId": "stage-010",
                "flowType": "normal",
                "condition": "",
                "label": "",
                "archived": false
            },
            {
                "id": "edge-002",
                "sourceNodeId": "stage-010",
                "targetNodeId": "stage-020",
                "flowType": "normal",
                "condition": "",
                "label": "",
                "archived": false
            },
            {
                "id": "edge-003",
                "sourceNodeId": "stage-020",
                "targetNodeId": "stage-030",
                "flowType": "normal",
                "condition": "",
                "label": "",
                "archived": false
            },
            {
                "id": "edge-004",
                "sourceNodeId": "stage-030",
                "targetNodeId": "stage-040",
                "flowType": "normal",
                "condition": "",
                "label": "",
                "archived": false
            },
            {
                "id": "edge-005",
                "sourceNodeId": "stage-040",
                "targetNodeId": "stage-050",
                "flowType": "normal",
                "condition": "Sí",
                "label": "Conforme",
                "archived": false
            },
            {
                "id": "edge-006",
                "sourceNodeId": "stage-040",
                "targetNodeId": "stage-060",
                "flowType": "reject",
                "condition": "No",
                "label": "No conforme",
                "archived": false
            },
            {
                "id": "edge-007",
                "sourceNodeId": "stage-050",
                "targetNodeId": "stage-070",
                "flowType": "normal",
                "condition": "",
                "label": "",
                "archived": false
            },
            {
                "id": "edge-008",
                "sourceNodeId": "stage-060",
                "targetNodeId": "stage-070",
                "flowType": "exception",
                "condition": "Después de segregar",
                "label": "Registro",
                "archived": false
            },
            {
                "id": "edge-009",
                "sourceNodeId": "stage-070",
                "targetNodeId": "stage-080",
                "flowType": "normal",
                "condition": "Conforme",
                "label": "",
                "archived": false
            },
            {
                "id": "edge-010",
                "sourceNodeId": "stage-080",
                "targetNodeId": "stage-end",
                "flowType": "normal",
                "condition": "",
                "label": "",
                "archived": false
            }
        ],
        "validationAcknowledgements": []
    },
    "functions": [
        {
            "id": "func-030-01",
            "stageId": "stage-030",
            "description": "Llenar la cantidad correcta de producto sobre cada envase.",
            "requirement": "Peso llenado dentro de la tolerancia aprobada.",
            "specification": "Objetivo nominal según fórmula maestra.",
            "unit": "g",
            "tolerance": "Según especificación vigente",
            "inputs": [
                "Producto preparado",
                "Envase vacío"
            ],
            "outputs": [
                "Botella llenada"
            ],
            "customer": "Tapado",
            "specialCharacteristicIds": [
                "sc-critical"
            ],
            "referenceIds": [
                "ref-001"
            ],
            "status": "active",
            "notes": ""
        },
        {
            "id": "func-030-02",
            "stageId": "stage-030",
            "description": "Evitar contaminación o mezcla durante la llenado.",
            "requirement": "Ausencia de contaminación y mezcla de lotes.",
            "specification": "Línea preparada y liberación de limpieza.",
            "unit": "",
            "tolerance": "",
            "inputs": [
                "Equipo limpio"
            ],
            "outputs": [
                "Botella sin contaminación"
            ],
            "customer": "Producto terminado",
            "specialCharacteristicIds": [
                "sc-quality"
            ],
            "referenceIds": [],
            "status": "active",
            "notes": ""
        },
        {
            "id": "func-040-01",
            "stageId": "stage-040",
            "description": "Detectar y rechazar botellas con peso fuera de tolerancia.",
            "requirement": "Inspección automática del 100 % de las botellas.",
            "specification": "Límites configurados por receta aprobada.",
            "unit": "g",
            "tolerance": "Según receta",
            "inputs": [
                "Botella llenada"
            ],
            "outputs": [
                "Botella clasificada"
            ],
            "customer": "Tapado",
            "specialCharacteristicIds": [
                "sc-critical"
            ],
            "referenceIds": [
                "ref-001"
            ],
            "status": "active",
            "notes": ""
        },
        {
            "id": "func-050-01",
            "stageId": "stage-050",
            "description": "Cerrar y ensamblar el producto sin dañar sus componentes.",
            "requirement": "Cierre completo, estable y correctamente posicionado.",
            "specification": "Parámetros de equipo validados.",
            "unit": "",
            "tolerance": "",
            "inputs": [
                "Botella llenada",
                "Componentes"
            ],
            "outputs": [
                "Botella tapada"
            ],
            "customer": "Inspección final",
            "specialCharacteristicIds": [
                "sc-quality"
            ],
            "referenceIds": [],
            "status": "active",
            "notes": ""
        }
    ],
    "failureModes": [
        {
            "id": "fm-030-01-01",
            "functionId": "func-030-01",
            "description": "No dosifica producto.",
            "category": "No ocurre",
            "source": "team",
            "status": "active",
            "dispositionReason": ""
        },
        {
            "id": "fm-030-01-02",
            "functionId": "func-030-01",
            "description": "Dosifica menos producto que el requerido.",
            "category": "Insuficiente",
            "source": "library",
            "status": "active",
            "dispositionReason": ""
        },
        {
            "id": "fm-030-01-03",
            "functionId": "func-030-01",
            "description": "Dosifica más producto que el requerido.",
            "category": "Exceso",
            "source": "library",
            "status": "active",
            "dispositionReason": ""
        },
        {
            "id": "fm-030-02-01",
            "functionId": "func-030-02",
            "description": "Contamina el producto durante la llenado.",
            "category": "Contaminación",
            "source": "library",
            "status": "active",
            "dispositionReason": ""
        },
        {
            "id": "fm-040-01-01",
            "functionId": "func-040-01",
            "description": "No detecta una botella fuera de peso.",
            "category": "No detecta",
            "source": "team",
            "status": "active",
            "dispositionReason": ""
        },
        {
            "id": "fm-050-01-01",
            "functionId": "func-050-01",
            "description": "Cierre incompleto o mal posicionado.",
            "category": "Parcial",
            "source": "library",
            "status": "active",
            "dispositionReason": ""
        }
    ],
    "effects": [
        {
            "id": "eff-001",
            "failureModeId": "fm-030-01-02",
            "description": "Producto con dosis inferior a la especificada.",
            "level": "product",
            "affectedParty": "Producto final",
            "severity": 8,
            "severityRationale": "Puede comprometer el desempeño declarado del producto.",
            "classification": "quality",
            "specialCharacteristicIds": [
                "sc-critical"
            ],
            "referenceIds": [
                "ref-001"
            ],
            "active": true
        },
        {
            "id": "eff-002",
            "failureModeId": "fm-030-01-02",
            "description": "Reclamo o incumplimiento de requisito registrado.",
            "level": "customer",
            "affectedParty": "Cliente / regulador",
            "severity": 8,
            "severityRationale": "Impacto potencial en desempeño y cumplimiento.",
            "classification": "regulatory",
            "specialCharacteristicIds": [
                "sc-regulatory"
            ],
            "referenceIds": [],
            "active": true
        },
        {
            "id": "eff-003",
            "failureModeId": "fm-030-01-03",
            "description": "Producto con dosis superior a la especificada.",
            "level": "product",
            "affectedParty": "Producto final",
            "severity": 9,
            "severityRationale": "Puede elevar exposición y generar incumplimiento crítico.",
            "classification": "safety",
            "specialCharacteristicIds": [
                "sc-safety"
            ],
            "referenceIds": [],
            "active": true
        },
        {
            "id": "eff-004",
            "failureModeId": "fm-040-01-01",
            "description": "Botella fuera de especificación continúa a las etapas siguientes.",
            "level": "next-process",
            "affectedParty": "Cierre y empaque",
            "severity": 8,
            "severityRationale": "La falla deja de estar contenida en línea.",
            "classification": "quality",
            "specialCharacteristicIds": [
                "sc-critical"
            ],
            "referenceIds": [],
            "active": true
        },
        {
            "id": "eff-005",
            "failureModeId": "fm-050-01-01",
            "description": "Producto con integridad comprometida o ensamblado inestable.",
            "level": "customer",
            "affectedParty": "Consumidor",
            "severity": 7,
            "severityRationale": "Pérdida de funcionalidad y posible reclamo.",
            "classification": "quality",
            "specialCharacteristicIds": [
                "sc-quality"
            ],
            "referenceIds": [],
            "active": true
        },
        {
            "id": "eff-006",
            "failureModeId": "fm-030-01-01",
            "description": "Producto sin producto.",
            "level": "product",
            "affectedParty": "Producto final",
            "severity": 8,
            "severityRationale": "El producto no cumpliría su función.",
            "classification": "quality",
            "specialCharacteristicIds": [
                "sc-critical"
            ],
            "referenceIds": [],
            "active": true
        },
        {
            "id": "eff-007",
            "failureModeId": "fm-030-02-01",
            "description": "Producto contaminado o lote mezclado.",
            "level": "customer",
            "affectedParty": "Producto final",
            "severity": 9,
            "severityRationale": "Puede requerir rechazo de lote y evaluación regulatoria.",
            "classification": "regulatory",
            "specialCharacteristicIds": [
                "sc-regulatory"
            ],
            "referenceIds": [],
            "active": true
        }
    ],
    "causes": [
        {
            "id": "cause-001",
            "failureModeId": "fm-030-01-02",
            "description": "Variación de presión en la alimentación del llenador.",
            "category": "machine",
            "mechanism": "Caudal insuficiente durante parte del ciclo.",
            "trigger": "Pérdida de estabilidad de presión.",
            "evidence": "Riesgo identificado durante pruebas SAT.",
            "dataSource": "Pruebas de equipo",
            "status": "active",
            "notes": "",
            "controlAbsence": {
                "preventiveConfirmed": false,
                "detectionConfirmed": false
            }
        },
        {
            "id": "cause-002",
            "failureModeId": "fm-030-01-02",
            "description": "Parámetro de receta configurado por debajo del valor aprobado.",
            "category": "method",
            "mechanism": "Selección o carga incorrecta de receta.",
            "trigger": "Cambio de formato o intervención manual.",
            "evidence": "Revisión de diseño del sistema.",
            "dataSource": "URS y evaluación del equipo",
            "status": "active",
            "notes": "",
            "controlAbsence": {
                "preventiveConfirmed": false,
                "detectionConfirmed": false
            }
        },
        {
            "id": "cause-003",
            "failureModeId": "fm-030-01-03",
            "description": "Tiempo de apertura de válvula superior al objetivo.",
            "category": "machine",
            "mechanism": "Parámetro o respuesta de válvula fuera de condición.",
            "trigger": "Deriva o modificación de ajuste.",
            "evidence": "Análisis de parámetros críticos.",
            "dataSource": "Pruebas de ingeniería",
            "status": "active",
            "notes": "",
            "controlAbsence": {
                "preventiveConfirmed": true,
                "detectionConfirmed": false
            }
        },
        {
            "id": "cause-004",
            "failureModeId": "fm-040-01-01",
            "description": "Sistema de rechazo no actúa ante una detección fuera de límite.",
            "category": "machine",
            "mechanism": "Falla del actuador o lógica de rechazo.",
            "trigger": "Falla eléctrica, neumática o de comunicación.",
            "evidence": "Requiere challenge testing periódico.",
            "dataSource": "Análisis de diseño",
            "status": "active",
            "notes": "",
            "controlAbsence": {
                "preventiveConfirmed": true,
                "detectionConfirmed": false
            }
        },
        {
            "id": "cause-005",
            "failureModeId": "fm-050-01-01",
            "description": "Componente de cierre mal orientado en el alimentador.",
            "category": "material",
            "mechanism": "El sistema entrega una pieza invertida.",
            "trigger": "Atasco o alimentación irregular.",
            "evidence": "Observación en corrida de prueba.",
            "dataSource": "Prueba de línea",
            "status": "active",
            "notes": "",
            "controlAbsence": {
                "preventiveConfirmed": true,
                "detectionConfirmed": true
            }
        },
        {
            "id": "cause-006",
            "failureModeId": "fm-030-01-01",
            "description": "Ausencia de producto en el tanque de alimentación.",
            "category": "method",
            "mechanism": "Inicio o continuidad de producción sin nivel suficiente.",
            "trigger": "Falta de reposición o señal de nivel no atendida.",
            "evidence": "Revisión operativa.",
            "dataSource": "Equipo PFMEA",
            "status": "active",
            "notes": "",
            "controlAbsence": {
                "preventiveConfirmed": true,
                "detectionConfirmed": true
            }
        },
        {
            "id": "cause-007",
            "failureModeId": "fm-030-02-01",
            "description": "Limpieza incompleta del circuito antes del inicio del lote.",
            "category": "method",
            "mechanism": "Residuo o material extraño permanece en el sistema.",
            "trigger": "Ciclo de limpieza incompleto o liberación incorrecta.",
            "evidence": "Riesgo de puesta en marcha.",
            "dataSource": "Plan de validación de limpieza",
            "status": "active",
            "notes": "",
            "controlAbsence": {
                "preventiveConfirmed": false,
                "detectionConfirmed": true
            }
        }
    ],
    "controls": [
        {
            "id": "ctrl-001",
            "code": "CTRL-0001",
            "type": "preventive",
            "subtype": "process-parameter",
            "description": "Regulador de presión y verificación del valor al inicio del lote.",
            "status": "current",
            "method": "Lectura de presión contra límite definido",
            "frequency": "Inicio de lote",
            "sampleSize": "",
            "acceptanceCriteria": "Dentro de rango validado",
            "responsible": "Producción",
            "record": "Registro de arranque",
            "automatic": false,
            "automaticReject": false,
            "alarm": false,
            "interlock": false,
            "validated": true,
            "challengeTestRequired": false,
            "challengeTestCompleted": false,
            "evidence": "Protocolo de puesta en marcha",
            "referenceIds": [],
            "notes": ""
        },
        {
            "id": "ctrl-002",
            "code": "CTRL-0002",
            "type": "detection",
            "subtype": "checkweigher",
            "description": "Controladora de peso al 100 % con rechazo automático.",
            "status": "current",
            "method": "Medición automática individual",
            "frequency": "100 %",
            "sampleSize": "Todas las botellas",
            "acceptanceCriteria": "Límites de receta",
            "responsible": "Producción",
            "record": "Contador y registro del equipo",
            "automatic": true,
            "automaticReject": true,
            "alarm": true,
            "interlock": false,
            "validated": true,
            "challengeTestRequired": true,
            "challengeTestCompleted": true,
            "evidence": "Protocolo de validación y challenge",
            "referenceIds": [
                "ref-001"
            ],
            "notes": ""
        },
        {
            "id": "ctrl-003",
            "code": "CTRL-0003",
            "type": "preventive",
            "subtype": "recipe-lock",
            "description": "Receta aprobada con parámetros restringidos por nivel de acceso.",
            "status": "current",
            "method": "Control de acceso y selección de receta",
            "frequency": "Cada orden",
            "sampleSize": "",
            "acceptanceCriteria": "Receta coincidente con orden",
            "responsible": "Producción",
            "record": "Registro electrónico del equipo",
            "automatic": true,
            "automaticReject": false,
            "alarm": false,
            "interlock": true,
            "validated": true,
            "challengeTestRequired": false,
            "challengeTestCompleted": false,
            "evidence": "Prueba de control de accesos",
            "referenceIds": [
                "ref-003"
            ],
            "notes": ""
        },
        {
            "id": "ctrl-004",
            "code": "CTRL-0004",
            "type": "detection",
            "subtype": "challenge-test",
            "description": "Challenge test del sistema de rechazo al inicio y durante la corrida.",
            "status": "current",
            "method": "Patrones fuera de límite",
            "frequency": "Inicio y cada cambio definido",
            "sampleSize": "Patrones alto y bajo",
            "acceptanceCriteria": "Detección y rechazo correcto",
            "responsible": "Producción / QA",
            "record": "Registro de challenge testing",
            "automatic": false,
            "automaticReject": true,
            "alarm": true,
            "interlock": false,
            "validated": true,
            "challengeTestRequired": true,
            "challengeTestCompleted": true,
            "evidence": "Registro de prueba",
            "referenceIds": [
                "ref-001"
            ],
            "notes": ""
        },
        {
            "id": "ctrl-005",
            "code": "CTRL-0005",
            "type": "preventive",
            "subtype": "cleaning-validation",
            "description": "Ciclo de limpieza definido y liberación previa de la línea.",
            "status": "current",
            "method": "Ejecución de ciclo y verificación visual/documental",
            "frequency": "Antes de inicio según condición",
            "sampleSize": "",
            "acceptanceCriteria": "Ciclo completo y equipo liberado",
            "responsible": "Producción / QA",
            "record": "Registro de limpieza",
            "automatic": false,
            "automaticReject": false,
            "alarm": false,
            "interlock": false,
            "validated": false,
            "challengeTestRequired": false,
            "challengeTestCompleted": false,
            "evidence": "Validación pendiente de cierre",
            "referenceIds": [],
            "notes": ""
        }
    ],
    "controlLinks": [
        {
            "id": "cl-001",
            "controlId": "ctrl-001",
            "causeId": "cause-001",
            "failureModeId": null,
            "stageId": "stage-030",
            "relationship": "prevents"
        },
        {
            "id": "cl-002",
            "controlId": "ctrl-002",
            "causeId": "cause-001",
            "failureModeId": "fm-030-01-02",
            "stageId": "stage-030",
            "relationship": "detects"
        },
        {
            "id": "cl-003",
            "controlId": "ctrl-003",
            "causeId": "cause-002",
            "failureModeId": null,
            "stageId": "stage-030",
            "relationship": "prevents"
        },
        {
            "id": "cl-004",
            "controlId": "ctrl-002",
            "causeId": "cause-002",
            "failureModeId": "fm-030-01-02",
            "stageId": "stage-030",
            "relationship": "detects"
        },
        {
            "id": "cl-005",
            "controlId": "ctrl-002",
            "causeId": "cause-003",
            "failureModeId": "fm-030-01-03",
            "stageId": "stage-030",
            "relationship": "detects"
        },
        {
            "id": "cl-006",
            "controlId": "ctrl-004",
            "causeId": "cause-004",
            "failureModeId": "fm-040-01-01",
            "stageId": "stage-040",
            "relationship": "detects"
        },
        {
            "id": "cl-007",
            "controlId": "ctrl-005",
            "causeId": "cause-007",
            "failureModeId": "fm-030-02-01",
            "stageId": "stage-030",
            "relationship": "prevents"
        }
    ],
    "reactionPlans": [
        {
            "id": "react-001",
            "code": "RP-0001",
            "trigger": "Botella fuera de los límites de peso.",
            "immediateAction": "Rechazar automáticamente la botella.",
            "stopLine": true,
            "segregationRequired": true,
            "segregationScope": "Desde el último control conforme si se supera el criterio de tendencia.",
            "cutoffPoint": "Último challenge conforme o último control documentado.",
            "additionalInspection": "Verificación de botellas retenidas según evaluación.",
            "adjustmentCorrection": "Ajustar presión o parámetro y verificar cinco botellas consecutivas.",
            "materialDisposition": "Segregar y evaluar producto afectado.",
            "restartCriteria": "Challenge conforme y cinco botellas dentro de tolerancia.",
            "responsible": "Producción",
            "escalation": "Notificar a QA ante repetición o pérdida de control.",
            "record": "Registro de desvío y control en línea",
            "notification": "Producción, QA y Mantenimiento",
            "linkedControlIds": [
                "ctrl-002",
                "ctrl-004"
            ],
            "linkedCauseIds": [
                "cause-001",
                "cause-002",
                "cause-003",
                "cause-004"
            ],
            "notes": ""
        }
    ],
    "risks": [
        {
            "id": "risk-001",
            "code": "R-0001",
            "causeId": "cause-001",
            "governingEffectId": "eff-001",
            "current": {
                "severity": 8,
                "occurrence": 4,
                "detection": 3,
                "rpn": 96,
                "severityRationale": "Efecto de desempeño significativo.",
                "occurrenceRationale": "Variación ocasional durante ajuste.",
                "detectionRationale": "Control automático al 100 % con rechazo."
            },
            "decision": "accepted-currently",
            "acceptanceJustification": "Riesgo controlado durante validación, sujeto a monitoreo de capacidad.",
            "target": null,
            "residual": null,
            "actionIds": [],
            "status": "evaluated",
            "notes": ""
        },
        {
            "id": "risk-002",
            "code": "R-0002",
            "causeId": "cause-002",
            "governingEffectId": "eff-001",
            "current": {
                "severity": 8,
                "occurrence": 2,
                "detection": 4,
                "rpn": 64,
                "severityRationale": "Efecto de desempeño significativo.",
                "occurrenceRationale": "Receta restringida y seleccionada por orden.",
                "detectionRationale": "Control de peso detecta salida, pero no la causa antes de producir."
            },
            "decision": "accepted-currently",
            "acceptanceJustification": "Controles de receta y peso considerados adecuados.",
            "target": null,
            "residual": null,
            "actionIds": [],
            "status": "evaluated",
            "notes": ""
        },
        {
            "id": "risk-003",
            "code": "R-0003",
            "causeId": "cause-003",
            "governingEffectId": "eff-003",
            "current": {
                "severity": 9,
                "occurrence": 3,
                "detection": 3,
                "rpn": 81,
                "severityRationale": "Potencial impacto crítico por sobrellenado.",
                "occurrenceRationale": "Parámetros controlados, con riesgo de deriva.",
                "detectionRationale": "Control al 100 % con rechazo automático."
            },
            "decision": "requires-action",
            "acceptanceJustification": "",
            "target": {
                "severity": 9,
                "occurrence": 2,
                "detection": 2,
                "rpn": 36,
                "rationale": "Monitoreo continuo de presión y tendencia."
            },
            "residual": null,
            "actionIds": [
                "action-001"
            ],
            "status": "action-open",
            "notes": ""
        },
        {
            "id": "risk-004",
            "code": "R-0004",
            "causeId": "cause-004",
            "governingEffectId": "eff-004",
            "current": {
                "severity": 8,
                "occurrence": 3,
                "detection": 8,
                "rpn": 192,
                "severityRationale": "Escape de botella no conforme.",
                "occurrenceRationale": "Falla ocasional del mecanismo es posible.",
                "detectionRationale": "Sin challenge, la falla del rechazo puede pasar inadvertida."
            },
            "decision": "requires-action",
            "acceptanceJustification": "",
            "target": {
                "severity": 8,
                "occurrence": 2,
                "detection": 3,
                "rpn": 48,
                "rationale": "Challenge test periódico y confirmación de rechazo."
            },
            "residual": null,
            "actionIds": [
                "action-002"
            ],
            "status": "action-open",
            "notes": ""
        },
        {
            "id": "risk-005",
            "code": "R-0005",
            "causeId": "cause-005",
            "governingEffectId": "eff-005",
            "current": {
                "severity": 7,
                "occurrence": 4,
                "detection": 6,
                "rpn": 168,
                "severityRationale": "Pérdida de integridad del producto.",
                "occurrenceRationale": "Observado en pruebas de ajuste.",
                "detectionRationale": "Inspección visual posterior dependiente del operador."
            },
            "decision": "requires-action",
            "acceptanceJustification": "",
            "target": {
                "severity": 7,
                "occurrence": 2,
                "detection": 3,
                "rpn": 42,
                "rationale": "Poka-yoke de orientación y sensor de presencia."
            },
            "residual": null,
            "actionIds": [
                "action-003"
            ],
            "status": "action-open",
            "notes": ""
        },
        {
            "id": "risk-006",
            "code": "R-0006",
            "causeId": "cause-006",
            "governingEffectId": "eff-006",
            "current": {
                "severity": 8,
                "occurrence": 2,
                "detection": 5,
                "rpn": 80,
                "severityRationale": "Producto sin función.",
                "occurrenceRationale": "Evento poco frecuente con control operativo.",
                "detectionRationale": "El peso puede detectar, pero la reacción depende del sistema."
            },
            "decision": "accepted-temporarily",
            "acceptanceJustification": "Pendiente confirmar interlock de nivel bajo.",
            "target": {
                "severity": 8,
                "occurrence": 1,
                "detection": 2,
                "rpn": 16,
                "rationale": "Interlock por nivel bajo."
            },
            "residual": null,
            "actionIds": [
                "action-004"
            ],
            "status": "action-open",
            "notes": ""
        },
        {
            "id": "risk-007",
            "code": "R-0007",
            "causeId": "cause-007",
            "governingEffectId": "eff-007",
            "current": {
                "severity": 9,
                "occurrence": 3,
                "detection": 7,
                "rpn": 189,
                "severityRationale": "Potencial impacto regulatorio y rechazo de lote.",
                "occurrenceRationale": "Proceso de limpieza aún en validación.",
                "detectionRationale": "Detección limitada por inspección visual y revisión documental."
            },
            "decision": "requires-action",
            "acceptanceJustification": "",
            "target": {
                "severity": 9,
                "occurrence": 2,
                "detection": 5,
                "rpn": 90,
                "rationale": "Cierre de validación de limpieza y criterios objetivos."
            },
            "residual": null,
            "actionIds": [
                "action-005"
            ],
            "status": "action-open",
            "notes": ""
        }
    ],
    "actions": [
        {
            "id": "action-001",
            "code": "A-0001",
            "description": "Implementar monitoreo continuo de presión con alarma de tendencia.",
            "type": "automation",
            "linkedRiskIds": [
                "risk-003"
            ],
            "responsible": "Ingeniería",
            "area": "Ingeniería",
            "targetDate": "",
            "priority": "high",
            "status": "in-progress",
            "implementedDate": "",
            "evidence": [],
            "result": "",
            "effectiveness": {
                "status": "not-started",
                "result": "",
                "verifiedBy": "",
                "verifiedAt": null,
                "notes": ""
            },
            "affects": {
                "severity": false,
                "occurrence": true,
                "detection": true
            },
            "createdControlIds": [],
            "modifiedControlIds": [
                "ctrl-001"
            ],
            "notes": ""
        },
        {
            "id": "action-002",
            "code": "A-0002",
            "description": "Formalizar challenge testing del rechazo al inicio y durante la corrida.",
            "type": "challenge-testing",
            "linkedRiskIds": [
                "risk-004"
            ],
            "responsible": "QA / Producción",
            "area": "Calidad",
            "targetDate": "",
            "priority": "critical",
            "status": "implemented",
            "implementedDate": "",
            "evidence": [
                "Registro de challenge testing Rev.01"
            ],
            "result": "Prueba implementada; pendiente completar verificación de efectividad.",
            "effectiveness": {
                "status": "pending-verification",
                "result": "",
                "verifiedBy": "",
                "verifiedAt": null,
                "notes": ""
            },
            "affects": {
                "severity": false,
                "occurrence": true,
                "detection": true
            },
            "createdControlIds": [
                "ctrl-004"
            ],
            "modifiedControlIds": [],
            "notes": ""
        },
        {
            "id": "action-003",
            "code": "A-0003",
            "description": "Agregar poka-yoke de orientación y sensor de presencia del componente de cierre.",
            "type": "poka-yoke",
            "linkedRiskIds": [
                "risk-005"
            ],
            "responsible": "Ingeniería",
            "area": "Ingeniería",
            "targetDate": "",
            "priority": "high",
            "status": "proposed",
            "implementedDate": "",
            "evidence": [],
            "result": "",
            "effectiveness": {
                "status": "not-started",
                "result": "",
                "verifiedBy": "",
                "verifiedAt": null,
                "notes": ""
            },
            "affects": {
                "severity": false,
                "occurrence": true,
                "detection": true
            },
            "createdControlIds": [],
            "modifiedControlIds": [],
            "notes": ""
        },
        {
            "id": "action-004",
            "code": "A-0004",
            "description": "Confirmar e implementar interlock de nivel bajo para impedir llenado sin producto.",
            "type": "interlock",
            "linkedRiskIds": [
                "risk-006"
            ],
            "responsible": "Automatización",
            "area": "Ingeniería",
            "targetDate": "",
            "priority": "medium",
            "status": "accepted",
            "implementedDate": "",
            "evidence": [],
            "result": "",
            "effectiveness": {
                "status": "not-started",
                "result": "",
                "verifiedBy": "",
                "verifiedAt": null,
                "notes": ""
            },
            "affects": {
                "severity": false,
                "occurrence": true,
                "detection": true
            },
            "createdControlIds": [],
            "modifiedControlIds": [],
            "notes": ""
        },
        {
            "id": "action-005",
            "code": "A-0005",
            "description": "Cerrar validación de limpieza con criterios de éxito y evidencia documental.",
            "type": "validation",
            "linkedRiskIds": [
                "risk-007"
            ],
            "responsible": "QA / Validaciones",
            "area": "Calidad",
            "targetDate": "",
            "priority": "critical",
            "status": "in-progress",
            "implementedDate": "",
            "evidence": [],
            "result": "",
            "effectiveness": {
                "status": "not-started",
                "result": "",
                "verifiedBy": "",
                "verifiedAt": null,
                "notes": ""
            },
            "affects": {
                "severity": false,
                "occurrence": true,
                "detection": true
            },
            "createdControlIds": [],
            "modifiedControlIds": [
                "ctrl-005"
            ],
            "notes": ""
        }
    ],
    "revisionHistory": [
        {
            "id": "ec1adcc3-0a31-47c7-9dc7-3fc862abc25f",
            "revision": "02",
            "date": "2026-08-28",
            "description": "Creación del proyecto",
            "responsible": "Aseguramiento de Calidad",
            "status": "draft",
            "sourceProjectId": null
        }
    ],
    "exportHistory": [],
    "workflow": {
        "sectionStatus": {
            "setup": "complete",
            "map": "complete",
            "analysis": "in-progress",
            "actions": "in-progress",
            "review": "not-started",
            "export": "not-started"
        },
        "stageStatus": {
            "stage-010": "not-started",
            "stage-020": "not-started",
            "stage-030": "complete",
            "stage-040": "in-progress",
            "stage-050": "in-progress",
            "stage-060": "not-applicable",
            "stage-070": "not-started",
            "stage-080": "not-started"
        },
        "reviewRequiredStageIds": [],
        "closure": {
            "comment": "",
            "exceptions": [],
            "confirmedBy": "",
            "confirmedAt": null
        }
    },
    "clientState": {
        "lastRoute": "#project/pfmea-demo-llenado/overview",
        "selectedMapNodeId": "stage-030",
        "selectedFunctionId": "func-030-01",
        "selectedFailureModeId": "fm-030-01-02",
        "selectedCauseId": "cause-001",
        "selectedRiskId": "risk-001",
        "setupTab": "identification",
        "analysisTab": "chain",
        "showAdvancedFields": false,
        "libraryFilter": "all"
    }
};
    const now = new Date();
    const iso = now.toISOString();
    const dateOffset = (days) => new Date(now.getTime() + days * 86400000).toISOString().slice(0, 10);
    project.schemaVersion = SCHEMA_VERSION;
    project.appVersion = APP_VERSION;
    project.metadata.startDate = iso.slice(0, 10);
    project.metadata.createdAt = iso;
    project.metadata.updatedAt = iso;
    project.metadata.lastExternalBackupAt = null;
    project.metadata.lastExportAt = null;
    project.processMap.confirmedAt = new Date(now.getTime() - 2 * 86400000).toISOString();
    project.revisionHistory = (project.revisionHistory || []).map((item) => ({ ...item, date: iso.slice(0, 10) }));
    const actionOffsets = [25, -5, 45, 18, 12];
    project.actions = (project.actions || []).map((action, index) => ({
      ...action,
      targetDate: dateOffset(actionOffsets[index] ?? 30),
      implementedDate: action.status === 'implemented' ? dateOffset(-2) : ''
    }));
    project.clientState.lastRoute = `#project/${project.id}/overview`;
    return normalizeProject(project);
  }

  function calculateRpn(severity, occurrence, detection) {
    const values = [severity, occurrence, detection].map(Number);
    if (values.some((value) => !Number.isFinite(value) || value < 1 || value > 10)) return null;
    return values[0] * values[1] * values[2];
  }

  function governingSeverity(project, failureModeId) {
    const activeEffects = project.effects.filter((effect) => effect.failureModeId === failureModeId && effect.active !== false);
    if (!activeEffects.length) return { severity: null, effectId: null };
    const governing = activeEffects.reduce((max, effect) => Number(effect.severity || 0) > Number(max.severity || 0) ? effect : max, activeEffects[0]);
    return { severity: Number(governing.severity || 0) || null, effectId: governing.id };
  }

  function riskContext(project, risk) {
    const cause = project.causes.find((item) => item.id === risk.causeId) || null;
    const failureMode = cause ? project.failureModes.find((item) => item.id === cause.failureModeId) || null : null;
    const fn = failureMode ? project.functions.find((item) => item.id === failureMode.functionId) || null : null;
    const stage = fn ? project.processMap.nodes.find((item) => item.id === fn.stageId) || null : null;
    const effect = project.effects.find((item) => item.id === risk.governingEffectId) || null;
    return { cause, failureMode, function: fn, stage, effect };
  }

  function stageRisks(project, stageId) {
    return project.risks.filter((risk) => riskContext(project, risk).stage?.id === stageId);
  }

  function projectMetrics(project) {
    const analyzableStages = project.processMap.nodes.filter((node) => !node.archived && !['start', 'end'].includes(node.type));
    const completedStages = analyzableStages.filter((node) => ['complete', 'not-applicable'].includes(project.workflow.stageStatus[node.id])).length;
    const evaluatedRisks = project.risks.filter((risk) => Number.isFinite(Number(risk.current?.rpn))).length;
    const openActions = project.actions.filter((action) => !['effectiveness-verified', 'cancelled', 'replaced'].includes(action.status)).length;
    const overdueActions = project.actions.filter((action) => action.targetDate && new Date(`${action.targetDate}T23:59:59`) < new Date() && !['effectiveness-verified', 'cancelled', 'replaced'].includes(action.status)).length;
    const maxRpn = project.risks.reduce((max, risk) => Math.max(max, Number(risk.current?.rpn || 0)), 0);
    const criticalRisks = project.risks.filter((risk) => Number(risk.current?.severity || 0) >= Number(project.methodology.thresholds.criticalSeverity || 9) || Number(risk.current?.rpn || 0) >= Number(project.methodology.thresholds.actionRpn || 180)).length;
    const setupFields = [project.metadata.name, project.metadata.processName, project.scope.processStart, project.scope.processEnd];
    const setupProgress = Math.round((setupFields.filter(Boolean).length / setupFields.length) * 100);
    const mapProgress = analyzableStages.length ? Math.min(100, Math.round((project.processMap.edges.length / Math.max(1, project.processMap.nodes.length - 1)) * 75) + (project.processMap.confirmedAt ? 25 : 0)) : 0;
    const analysisProgress = analyzableStages.length ? Math.round((completedStages / analyzableStages.length) * 100) : 0;
    const actionsDone = project.actions.filter((action) => ['effectiveness-verified', 'cancelled', 'replaced'].includes(action.status)).length;
    const actionProgress = project.actions.length ? Math.round((actionsDone / project.actions.length) * 100) : 0;
    const totalProgress = Math.round(setupProgress * 0.15 + mapProgress * 0.2 + analysisProgress * 0.45 + actionProgress * 0.2);
    return {
      stages: analyzableStages.length,
      completedStages,
      risks: project.risks.length,
      evaluatedRisks,
      maxRpn,
      criticalRisks,
      openActions,
      overdueActions,
      setupProgress,
      mapProgress,
      analysisProgress,
      actionProgress,
      totalProgress
    };
  }

  function nextCode(collection, prefix, digits = 4) {
    const numbers = collection.map((item) => {
      const match = String(item.code || '').match(/(\d+)$/);
      return match ? Number(match[1]) : 0;
    });
    const next = Math.max(0, ...numbers) + 1;
    return `${prefix}${String(next).padStart(digits, '0')}`;
  }

  function normalizeProject(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('El archivo no contiene un objeto de proyecto válido.');
    if (!raw.id || !raw.metadata || !raw.processMap) throw new Error('Faltan identificadores o bloques principales del proyecto.');
    const base = createProject({ id: raw.id, name: raw.metadata.name, code: raw.metadata.code, revision: raw.metadata.revision });
    const merged = {
      ...base,
      ...raw,
      metadata: { ...base.metadata, ...(raw.metadata || {}) },
      scope: { ...base.scope, ...(raw.scope || {}) },
      methodology: {
        ...base.methodology,
        ...(raw.methodology || {}),
        thresholds: { ...base.methodology.thresholds, ...(raw.methodology?.thresholds || {}) },
        scales: { ...base.methodology.scales, ...(raw.methodology?.scales || {}) }
      },
      processMap: {
        ...base.processMap,
        ...(raw.processMap || {}),
        nodes: Array.isArray(raw.processMap?.nodes) ? raw.processMap.nodes : [],
        edges: Array.isArray(raw.processMap?.edges) ? raw.processMap.edges : []
      },
      team: Array.isArray(raw.team) ? raw.team : [],
      references: Array.isArray(raw.references) ? raw.references : [],
      functions: Array.isArray(raw.functions) ? raw.functions : [],
      failureModes: Array.isArray(raw.failureModes) ? raw.failureModes : [],
      effects: Array.isArray(raw.effects) ? raw.effects : [],
      causes: Array.isArray(raw.causes) ? raw.causes : [],
      controls: Array.isArray(raw.controls) ? raw.controls : [],
      controlLinks: Array.isArray(raw.controlLinks) ? raw.controlLinks : [],
      reactionPlans: Array.isArray(raw.reactionPlans) ? raw.reactionPlans : [],
      risks: Array.isArray(raw.risks) ? raw.risks : [],
      actions: Array.isArray(raw.actions) ? raw.actions : [],
      revisionHistory: Array.isArray(raw.revisionHistory) ? raw.revisionHistory : [],
      exportHistory: Array.isArray(raw.exportHistory) ? raw.exportHistory : [],
      workflow: {
        ...base.workflow,
        ...(raw.workflow || {}),
        sectionStatus: { ...base.workflow.sectionStatus, ...(raw.workflow?.sectionStatus || {}) },
        stageStatus: { ...base.workflow.stageStatus, ...(raw.workflow?.stageStatus || {}) }
      },
      clientState: { ...base.clientState, ...(raw.clientState || {}) }
    };
    merged.causes = merged.causes.map((cause) => ({
      ...cause,
      controlAbsence: {
        preventiveConfirmed: false,
        detectionConfirmed: false,
        ...(cause.controlAbsence || {})
      }
    }));
    merged.risks = merged.risks.map((risk) => ({
      ...risk,
      current: {
        severity: null,
        occurrence: null,
        detection: null,
        rpn: null,
        severityRationale: '',
        occurrenceRationale: '',
        detectionRationale: '',
        ...(risk.current || {})
      },
      decision: risk.decision || 'pending',
      acceptanceJustification: risk.acceptanceJustification || '',
      actionIds: Array.isArray(risk.actionIds) ? risk.actionIds : []
    }));
    merged.schemaVersion = SCHEMA_VERSION;
    merged.appVersion = APP_VERSION;
    if (typeof merged.clientState.showAdvancedFields !== 'boolean') merged.clientState.showAdvancedFields = false;
    if (!merged.clientState.analysisTab) merged.clientState.analysisTab = 'chain';
    if (!merged.metadata.updatedAt) merged.metadata.updatedAt = nowIso();
    return merged;
  }

  window.PFMEA_MODEL = {
    SCHEMA_VERSION,
    APP_VERSION,
    nowIso,
    uuid,
    defaultMethodology,
    createProject,
    sampleProject,
    calculateRpn,
    governingSeverity,
    riskContext,
    stageRisks,
    projectMetrics,
    nextCode,
    normalizeProject
  };
})();
