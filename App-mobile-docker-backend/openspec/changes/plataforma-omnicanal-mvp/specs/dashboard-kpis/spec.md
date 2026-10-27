# Spec Delta

## Purpose

Entrega al Gerente indicadores comerciales, de inventario, logísticos y financieros calculados a partir de los datos reales de la plataforma, para que las decisiones dejen de tomarse sin datos confiables.

## ADDED Requirements

### Requirement: CU-12 Consultar KPIs en dashboard
El sistema DEBE (SHALL) ofrecer al Gerente un dashboard con los indicadores de la plataforma para un periodo seleccionable, y negar el acceso a cualquier otro rol.

#### Scenario: Gerente abre el dashboard
- **WHEN** el Gerente abre el dashboard
- **THEN** el sistema muestra los indicadores comerciales, de inventario, logísticos y financieros del mes en curso

#### Scenario: Cambio de periodo
- **WHEN** el Gerente selecciona otro periodo
- **THEN** todos los indicadores se recalculan para ese periodo

#### Scenario: Periodo sin datos
- **WHEN** el periodo seleccionado no tiene datos para un indicador
- **THEN** el dashboard muestra ese indicador como sin datos en lugar de mostrar cero

#### Scenario: Otro rol
- **WHEN** un Cliente, Vendedor, usuario de Bodega o RRHH solicita el dashboard o sus datos
- **THEN** el sistema rechaza la solicitud

### Requirement: Indicadores comerciales
El dashboard DEBE (SHALL) mostrar las ventas mensuales en monto y cantidad, separadas por canal, el ticket promedio y la conversión del e-commerce, calculada como compras pagadas sobre visitas.

#### Scenario: Ventas por canal
- **WHEN** el Gerente consulta un mes con ventas en POS y e-commerce
- **THEN** el dashboard muestra el monto y la cantidad de ventas de cada canal y el total

#### Scenario: Ticket promedio
- **WHEN** en el periodo hubo 10 ventas por un total de $400.000
- **THEN** el dashboard muestra un ticket promedio de $40.000

#### Scenario: Conversión
- **WHEN** en el periodo hubo 200 visitas al e-commerce y 6 compras pagadas
- **THEN** el dashboard muestra una conversión de 3%

#### Scenario: Ventas no confirmadas
- **WHEN** existen compras rechazadas, expiradas o reversadas en el periodo
- **THEN** esas compras no se cuentan en las ventas ni en el ticket promedio

### Requirement: Indicadores de inventario
El dashboard DEBE (SHALL) mostrar la exactitud de inventario y las diferencias de stock calculadas a partir de los conteos físicos del periodo, las mermas por tipo y el tiempo promedio de búsqueda de producto.

#### Scenario: Exactitud de inventario
- **WHEN** en el periodo se hicieron 100 conteos y 97 coincidieron con el stock del sistema
- **THEN** el dashboard muestra una exactitud de inventario de 97%

#### Scenario: Diferencias de stock
- **WHEN** los conteos del periodo esperaban 500 unidades y la suma de las diferencias encontradas fue de 10 unidades
- **THEN** el dashboard muestra diferencias de stock de 2%

#### Scenario: Mermas por tipo
- **WHEN** el Gerente consulta un periodo con mermas
- **THEN** el dashboard muestra las unidades y el costo de las mermas separadas en dañado, muestra y cambio

#### Scenario: Tiempo de búsqueda
- **WHEN** existen búsquedas de producto completadas en el periodo
- **THEN** el dashboard muestra su duración promedio en minutos

### Requirement: Indicadores logísticos y de disponibilidad
El dashboard DEBE (SHALL) mostrar el porcentaje de pedidos despachados dentro de las 24 horas siguientes al pago y el porcentaje de tiempo en que el catálogo web estuvo disponible.

#### Scenario: Pedidos despachados en 24 horas
- **WHEN** en el periodo se pagaron 40 pedidos y 38 se despacharon dentro de 24 horas
- **THEN** el dashboard muestra 95%

#### Scenario: Disponibilidad del catálogo
- **WHEN** el Gerente consulta un periodo
- **THEN** el dashboard muestra el porcentaje de verificaciones automáticas en que el catálogo web respondió correctamente

### Requirement: Rentabilidad neta automática
El sistema DEBE (SHALL) calcular la rentabilidad neta de cada venta como el total cobrado menos el costo de compra de los productos, la comisión del medio de pago y el costo del despacho, usando el costo vigente al momento de la venta.

#### Scenario: Venta POS
- **WHEN** se vende en POS por $30.000 con tarjeta un producto cuyo costo es $12.000 y la comisión es $600
- **THEN** la rentabilidad neta de la venta es $17.400

#### Scenario: Venta e-commerce con despacho
- **WHEN** se cobra $34.000 (producto $30.000 más flete $4.000), el costo de compra es $12.000, la comisión $680 y el despacho cuesta $4.000 a la tienda
- **THEN** la rentabilidad neta de la venta es $17.320

#### Scenario: Cambio de costo posterior
- **WHEN** el costo de compra de un producto cambia después de una venta
- **THEN** la rentabilidad de esa venta no cambia

#### Scenario: Rentabilidad del periodo
- **WHEN** el Gerente consulta un periodo
- **THEN** el dashboard muestra la rentabilidad neta total, el margen sobre ventas y los productos más y menos rentables

#### Scenario: Producto sin costo registrado
- **WHEN** un producto vendido no tiene costo de compra registrado
- **THEN** el dashboard advierte que la rentabilidad del periodo está incompleta e indica qué productos no tienen costo

### Requirement: Indicadores financieros ROI, VAN y TIR
El sistema DEBE (SHALL) calcular ROI, VAN y TIR a partir de la inversión inicial, la tasa de descuento anual y el horizonte en meses que ingresa el Gerente, usando como flujos la rentabilidad neta mensual real y, para los meses futuros del horizonte, el promedio de los meses reales.

#### Scenario: Parámetros ingresados
- **WHEN** el Gerente guarda la inversión inicial, la tasa de descuento y el horizonte
- **THEN** el dashboard muestra ROI, VAN y TIR e indica cuántos meses de flujo son reales y cuántos proyectados

#### Scenario: Sin parámetros
- **WHEN** el Gerente no ha ingresado los parámetros financieros
- **THEN** el dashboard solicita ingresarlos en lugar de mostrar ROI, VAN y TIR

#### Scenario: Cálculo conocido
- **WHEN** la inversión es $1.000.000, la tasa mensual equivalente es 1% y hay dos flujos mensuales de $600.000
- **THEN** el VAN mostrado es $182.237 y el ROI es 20%

#### Scenario: TIR no calculable
- **WHEN** los flujos no permiten obtener una TIR, por ejemplo porque todos son negativos
- **THEN** el dashboard muestra la TIR como no calculable

#### Scenario: Parámetros no válidos
- **WHEN** el Gerente ingresa una inversión no positiva, una tasa negativa o un horizonte menor a un mes
- **THEN** el sistema no guarda los parámetros e indica el dato no válido

### Requirement: Comparación con las metas
El dashboard DEBE (SHALL) indicar para cada indicador con meta si se cumple o no: exactitud de inventario mayor o igual a 98%, diferencias de stock menor o igual a 2%, tiempo de búsqueda menor o igual a 1,5 minutos, pedidos despachados en 24 horas mayor o igual a 95% y disponibilidad del catálogo de 100%.

#### Scenario: Meta cumplida
- **WHEN** la exactitud de inventario del periodo es 98,5%
- **THEN** el dashboard marca ese indicador como meta cumplida

#### Scenario: Meta no cumplida
- **WHEN** los pedidos despachados en 24 horas del periodo son 90%
- **THEN** el dashboard marca ese indicador como bajo la meta
