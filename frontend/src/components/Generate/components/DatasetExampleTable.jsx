import React from 'react';
import ExampleTable from '../../ExampleTable';

const DatasetExampleTable = ({ 
  datasetId, 
  datasetName, 
  refreshTrigger 
}) => {
  if (!datasetId) return null;
  
  return (
    <div className="border-t pt-6 w-full">
      <div className="w-full">
        <ExampleTable 
          datasetId={datasetId}
          datasetName={datasetName}
          refreshTrigger={refreshTrigger} 
        />
      </div>
    </div>
  );
};

export default DatasetExampleTable;