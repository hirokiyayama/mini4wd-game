import React from 'react';
import { Box, Cylinder, useTexture } from '@react-three/drei';
import type { MachineSetting } from './types';
import * as THREE from 'three';

interface CarModelProps {
  setting: MachineSetting;
}

export const CarModel: React.FC<CarModelProps> = ({ setting }) => {
  const texMagnum = useTexture('/magnum.jpg');
  const texSonic = useTexture('/sonic.jpg');
  const texTridagger = useTexture('/tridagger.jpg');

  texMagnum.colorSpace = THREE.SRGBColorSpace;
  texSonic.colorSpace = THREE.SRGBColorSpace;
  texTridagger.colorSpace = THREE.SRGBColorSpace;

  let activeTexture = texMagnum;
  if (setting.body === 'b_sonic') activeTexture = texSonic;
  if (setting.body === 'b_tridagger') activeTexture = texTridagger;

  // ローラーの判定
  const hasFrontRoller = setting.roller_front !== null;
  const isFrontAlum = setting.roller_front === 'rf_alum';
  const hasRearRoller = setting.roller_rear !== null;
  const isRearAlum = setting.roller_rear === 'rr_alum';
  
  const hasFrp = setting.frp !== null;
  const hasMassDamper = setting.mass_damper !== null;

  return (
    <group position={[0, 0.4, 0]}>
      
      {/* 2Dビルボード（スプライト）としてのボディ */}
      {/* 写真の白背景を少しでも目立たなくするため、2.5D表現で配置します */}
      <sprite scale={[3, 2, 1]} position={[0, 0, 0]}>
        <spriteMaterial map={activeTexture} />
      </sprite>

      {/* 車体の下の影っぽいやつ */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.3, 0]}>
        <planeGeometry args={[2.5, 2.5]} />
        <meshBasicMaterial color="#000" transparent opacity={0.3} />
      </mesh>

      {/* 3Dパーツ群 (スプライトの周りに配置して2.5D感を出す) */}
      <group position={[0, -0.15, 0]}>
        
        {/* FRPプレート */}
        {hasFrp && (
          <group>
            <Box args={[2.2, 0.05, 0.3]} position={[0, 0, 1.2]} castShadow>
              <meshStandardMaterial color="#444" metalness={0.5} roughness={0.8} />
            </Box>
            <Box args={[2.2, 0.05, 0.3]} position={[0, 0, -1.3]} castShadow>
              <meshStandardMaterial color="#444" metalness={0.5} roughness={0.8} />
            </Box>
          </group>
        )}

        {/* フロントローラー */}
        {hasFrontRoller && (
          <group>
            <Cylinder args={[0.2, 0.2, 0.1, 16]} position={[hasFrp ? 1.0 : 0.8, 0.1, 1.2]} castShadow>
              <meshStandardMaterial color={isFrontAlum ? '#eeeeee' : '#0055ff'} metalness={isFrontAlum ? 0.9 : 0} />
            </Cylinder>
            <Cylinder args={[0.2, 0.2, 0.1, 16]} position={[hasFrp ? -1.0 : -0.8, 0.1, 1.2]} castShadow>
              <meshStandardMaterial color={isFrontAlum ? '#eeeeee' : '#0055ff'} metalness={isFrontAlum ? 0.9 : 0} />
            </Cylinder>
          </group>
        )}

        {/* リアローラー */}
        {hasRearRoller && (
          <group>
            <Cylinder args={[0.2, 0.2, 0.1, 16]} position={[hasFrp ? 1.0 : 0.8, 0.1, -1.3]} castShadow>
              <meshStandardMaterial color={isRearAlum ? '#eeeeee' : '#ff5500'} metalness={isRearAlum ? 0.9 : 0} />
            </Cylinder>
            <Cylinder args={[0.2, 0.2, 0.1, 16]} position={[hasFrp ? -1.0 : -0.8, 0.1, -1.3]} castShadow>
              <meshStandardMaterial color={isRearAlum ? '#eeeeee' : '#ff5500'} metalness={isRearAlum ? 0.9 : 0} />
            </Cylinder>
          </group>
        )}

        {/* マスダンパー (サイド) */}
        {hasMassDamper && (
          <group>
            {/* ポール */}
            <Cylinder args={[0.02, 0.02, 0.5, 8]} position={[0.9, 0.2, 0]} castShadow>
              <meshStandardMaterial color="#ccc" metalness={0.8} />
            </Cylinder>
            <Cylinder args={[0.02, 0.02, 0.5, 8]} position={[-0.9, 0.2, 0]} castShadow>
              <meshStandardMaterial color="#ccc" metalness={0.8} />
            </Cylinder>
            
            {/* 重りブロック */}
            <Cylinder args={[0.15, 0.15, 0.2, 16]} position={[0.9, 0.1, 0]} castShadow>
              <meshStandardMaterial color="#b87333" metalness={0.7} roughness={0.3} />
            </Cylinder>
            <Cylinder args={[0.15, 0.15, 0.2, 16]} position={[-0.9, 0.1, 0]} castShadow>
              <meshStandardMaterial color="#b87333" metalness={0.7} roughness={0.3} />
            </Cylinder>
          </group>
        )}
      </group>
    </group>
  );
};
